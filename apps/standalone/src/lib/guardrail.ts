/**
 * Local, zero-cost input guardrail — the first step of the /api/answer pipeline.
 *
 * Why it exists: once the hosted demo forwards the query to a third-party model
 * (Groq / Gemini / OpenRouter), we no longer control where that text goes. The
 * only user-controlled text in the whole prompt is the question typed into the
 * box (the rest is fixed public corpus). So this scrubs *that* before it ever
 * leaves the server.
 *
 * Policy (deliberately chosen, see docs/generation-pipeline.md):
 *   - Length  → BLOCK (400). A hard ceiling; the main abuse/cost vector is a
 *     giant pasted blob. Mirrors the client `maxLength`, but never trust the client.
 *   - PII     → REDACT, not block. Accidental emails/phones/cards/SSNs are
 *     replaced with placeholders so the question still works, but the real value
 *     never reaches a third party. Redaction is friendlier than refusing.
 *   - Blocklist → BLOCK (400). Intentional abuse / prompt-injection markers are
 *     refused rather than silently cleaned. This is a cheap first pass; nuanced
 *     content-safety is handled separately by the Groq safety model.
 *
 * All patterns are best-effort, not exhaustive — a demo guardrail, not a DLP suite.
 */

export interface GuardrailConfig {
  /** Hard character ceiling on the query. */
  maxChars: number;
  /** Lower-cased substrings that cause an outright block. */
  blocklist: string[];
}

export type GuardrailResult =
  | { ok: true; query: string; redactions: RedactionKind[] }
  | { ok: false; code: 'too_long' | 'blocked'; reason: string };

export type RedactionKind = 'email' | 'ssn' | 'card' | 'phone';

/**
 * A small default blocklist focused on prompt-injection markers (the relevant
 * threat for a corpus-grounded RAG demo). Extend via `GUARDRAIL_BLOCKLIST`
 * (comma-separated) in the environment. Real content-safety (slurs, harmful
 * requests) is better handled by the Groq safety model, not a substring list.
 */
const DEFAULT_BLOCKLIST = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'disregard the sources',
  'disregard all previous',
];

// --- PII patterns (order of application matters; see applyGuardrails) ---
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
// Leading (?<!\d) stops a phone match from starting *inside* a longer digit run
// (e.g. a 16-digit non-card number), which would otherwise be partially redacted.
const PHONE = /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
// Card *candidates*: 13–19 digits, optionally separated by spaces/dashes. We only
// redact those that also pass a Luhn check, to avoid nuking arbitrary long numbers.
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

function intFromEnv(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Build config from the environment, with the documented defaults. */
export function defaultGuardrailConfig(env: Record<string, string | undefined> = process.env): GuardrailConfig {
  const extra = (env.GUARDRAIL_BLOCKLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    maxChars: intFromEnv(env.MAX_QUERY_CHARS, 500),
    blocklist: [...DEFAULT_BLOCKLIST, ...extra],
  };
}

/** Luhn checksum — the standard validity test for card numbers. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // '0' = 48
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function redactPattern(
  text: string,
  pattern: RegExp,
  placeholder: string,
  kind: RedactionKind,
  found: Set<RedactionKind>,
): string {
  return text.replace(pattern, () => {
    found.add(kind);
    return placeholder;
  });
}

function redactCards(text: string, found: Set<RedactionKind>): string {
  return text.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      found.add('card');
      return '[redacted-card]';
    }
    return match; // long number that isn't a valid card — leave it alone
  });
}

/**
 * Run the guardrail. Returns either a rejection (→ 400) or the possibly-redacted
 * query that should flow onward to retrieval + generation.
 */
export function applyGuardrails(raw: string, config: GuardrailConfig): GuardrailResult {
  const query = raw.trim();

  if (query.length > config.maxChars) {
    return {
      ok: false,
      code: 'too_long',
      reason: `Question is ${query.length} characters; the limit is ${config.maxChars}.`,
    };
  }

  const lower = query.toLowerCase();
  if (config.blocklist.some((term) => lower.includes(term))) {
    return { ok: false, code: 'blocked', reason: 'That question was blocked by the content filter.' };
  }

  // Redact structured PII first (email, SSN, then Luhn-checked cards) so the
  // broad phone pattern can't swallow those digit runs and mislabel them.
  const found = new Set<RedactionKind>();
  let out = query;
  out = redactPattern(out, EMAIL, '[redacted-email]', 'email', found);
  out = redactPattern(out, SSN, '[redacted-ssn]', 'ssn', found);
  out = redactCards(out, found);
  out = redactPattern(out, PHONE, '[redacted-phone]', 'phone', found);

  return { ok: true, query: out, redactions: [...found] };
}
