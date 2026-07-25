# Generation Pipeline — Design & Rationale

How the hosted demo turns a "Generate answer" click into a grounded, streamed
answer — and *why* each piece is built the way it is. This documents the layer
that sits on top of retrieval (retrieval itself is unchanged and runs entirely
in the browser).

> TL;DR: `/api/answer` runs **guardrail → rate-limit → safety → retrieve →
> failover generation → stream**. Generation uses three free-tier providers with
> automatic failover, gated by input guardrails and per-IP + global rate limits,
> all on stateless Vercel serverless functions.

---

## 1. Context & constraints

- **The site is mostly static.** The UI, corpus JSON, BM25, and in-browser query
  embedding are served as static assets from Vercel's CDN. Only `/api/answer` is
  server code — a **Node.js serverless function**.
- **Serverless is stateless and ephemeral.** Workers spin up per request, don't
  share memory, and have a read-only filesystem. Two consequences drive the whole
  design: (a) shared state (rate-limit counters) must live in an external store,
  and (b) there's no local model process — generation must call an HTTP API.
  Background: `research-advance/internet-web/web-servers/serverless-vs-traditional-servers.md`.
- **It's a public, free demo.** No per-call budget is desirable, so we lean on
  free-tier providers and cap usage hard rather than pay per token.
- **The corpus is public, low-sensitivity** (sports rules, Morse code). The only
  user-controlled text sent to third parties is the typed question.

---

## 2. The request pipeline

`apps/standalone/src/app/api/answer/route.ts` runs these steps in order. The first
three can reject **before** streaming starts, so they return clean HTTP status
codes; generation errors can only surface inline (status 200 is already sent).

| # | Step | Module | On failure |
|---|------|--------|-----------|
| 1 | **Guardrail** — length cap, PII redaction, blocklist | `lib/guardrail.ts` | `400` |
| 2 | **Rate limits** — per-IP + global, hour + day | `lib/ratelimit.ts` | `429` (+ `Retry-After`) |
| 3 | **Safety check** — Groq classifier (only if Groq configured) | `lib/groq-safety.ts` | `400` |
| 4 | **Retrieve** — build the grounded prompt | `@rag-glassbox/engine` | inline `[error]` |
| 5 | **Generate + stream** — failover across providers | `lib/providers.ts` + engine | inline `[error]` |

The redacted query from step 1 (`cleanQuery`) is what flows into retrieval and
generation — so any PII the user typed never reaches a provider.

---

## 3. Decisions & rationale

### 3.1 Multi-provider **failover** (not a single provider)

`FailoverGenerationProvider` (in the engine) wraps an ordered list and tries each
until one works: **Groq → Gemini → OpenRouter**.

- **Why:** reliability. If one free tier is rate-limited or down, the demo still
  answers. It is *not* a capacity multiplier — each request uses exactly one
  provider; the global rate limit (below) sits far under any single free tier, so
  we essentially never exhaust one. Failover is insurance, not scaling.
- **Streaming subtlety — "commit on first token":** once a provider emits a
  token, the client has rendered partial text, so we can't silently switch. The
  rule: a provider that throws *before* its first token → fall through to the
  next; one that throws *after* → rethrow. Aborts are never retried. See the
  class comment in `packages/engine/src/providers/failover.ts`.
- **Alternative considered:** a "smart" router that picks by latency/quota. Overkill
  for a demo; ordered failover is predictable and debuggable.

### 3.2 Reusing the OpenAI-compatible provider for all three

Groq, Gemini (via its compat endpoint), and OpenRouter all speak the OpenAI
`/chat/completions` streaming shape. So the engine's existing
`OpenAIGenerationProvider` drives all three — only `baseUrl`, `apiKey`, and
`model` differ. We added one field, `id`, so the failover chain can report *which*
host served or failed (`['groq','gemini','openrouter']`) instead of three
indistinguishable `'openai'`s. No new provider classes.

- Base URLs: Groq `https://api.groq.com/openai/v1`, Gemini
  `https://generativelanguage.googleapis.com/v1beta/openai/`, OpenRouter
  `https://openrouter.ai/api/v1`.
- Model defaults (2026-07, all env-overridable because free tiers churn):
  `llama-3.3-70b-versatile`, `gemini-2.5-flash`,
  `meta-llama/llama-3.3-70b-instruct:free`.

### 3.3 Guardrail: block length, **redact** PII, block blocklist

`lib/guardrail.ts`, always on, zero cost, runs first.

- **Length → block (400).** Default 500 chars. A question is short; the main abuse
  and token-cost vector is a giant pasted blob. Mirrored client-side via
  `maxLength`, but re-checked server-side (never trust the client).
- **PII → redact, not block.** Email / US phone / Luhn-valid card / SSN patterns
  are replaced with `[redacted-…]`. Redaction keeps the question usable while
  ensuring the real value never leaves the server. Cards are Luhn-checked so we
  don't nuke arbitrary long numbers (e.g. "1234567890123456 runs").
- **Blocklist → block (400).** A short built-in list of **prompt-injection**
  markers ("ignore previous instructions", …), extendable via
  `GUARDRAIL_BLOCKLIST`. Deliberately *not* a slur list — nuanced content-safety
  is the safety model's job (3.4), not a substring match.
- **Order matters:** email → SSN → card(Luhn) → phone, so the broad phone pattern
  can't swallow card/SSN digit runs first.
- **Note:** in semantic mode the browser computes the query embedding from the
  *raw* text. That vector stays server-side (retrieval is local math) and is never
  sent to a provider, so redaction of the *prompt* is what protects third-party
  exposure.

### 3.4 Safety check: a Groq classifier, gated to the Groq path

`lib/groq-safety.ts`. The original plan was Meta's **Llama Guard on Groq**, but
Groq **removed `meta-llama/llama-guard-4-12b` on 2026-03-05** (replaced by
`openai/gpt-oss-safeguard-20b`). Rather than pin a churning safety-model id, we run
a small fast Groq chat model (`llama-3.1-8b-instant` by default) as a strict
one-word **ALLOW/BLOCK** classifier, model swappable via `GROQ_GUARD_MODEL` (set it
to `openai/gpt-oss-safeguard-20b` for the purpose-built model).

- **Gated to Groq**, per the design decision: it only runs when `GROQ_API_KEY` is
  set. Because Groq is the *preferred* provider, this covers essentially every
  request. Running it **up front in the route** (not inside the provider) means a
  block returns a clean `400` instead of an error mid-stream — and it avoids the
  trap where a safety-throw inside a failover provider would just route *around*
  the block to the next provider.
- **Fail-open by default.** If the safety call itself errors (Groq down, model
  renamed), we log and allow — a low-risk public demo shouldn't go dark because a
  safety check hiccuped, and the local guardrail already stripped PII. Flip
  `GROQ_GUARD_FAIL_CLOSED=true` to reject instead.

### 3.5 Rate limiting: per-IP + global, on Upstash Redis

`lib/ratelimit.ts`, backed by Upstash (HTTP-based Redis).

- **Why Redis / Upstash:** serverless workers are stateless — a counter in a
  module variable resets on cold start and isn't shared across the parallel
  workers a burst spins up. Counters must live in one external store; Upstash is
  reachable over HTTP, which is what a short-lived function needs. (Vercel KV is
  Upstash under the hood.)
- **Two axes, four windows:**
  - Per-IP **5/hour, 50/day** — stops one visitor hammering the demo.
  - Global **60/hour, 300/day** — the real protector. Per-IP limits are trivially
    bypassed with a VPN, so a global circuit breaker is what actually bounds
    provider usage. 300/day across a 3-provider chain is ~100 each, far under any
    single free tier.
- **Order:** per-IP checked first (reject an abuser cheaply, without consuming a
  global token), then global. All four are env-tunable (`RL_*`).
- **Graceful when unconfigured:** no Upstash URL/token → limiting is skipped (local
  dev), not an error.

### 3.6 Runtime pinned to Node

`export const runtime = 'nodejs'` in the route. The route reads corpus files
(`node:fs`) and uses provider SDKs, which the Edge runtime can't do. `'nodejs'` is
already the default, but stating it prevents a future "optimize to Edge" from
breaking filesystem reads. It's a separate axis from `dynamic = 'force-dynamic'`
(which controls caching, not runtime).

---

## 4. Environment variables

Full list with defaults in `.env.example`. Secret values go in `.env.local`
(gitignored) and the Vercel dashboard — **never committed**, and **never** behind a
`NEXT_PUBLIC_` prefix (those are inlined into the browser bundle).

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_ENABLE_GENERATION` | Frontend flag: show the "Generate answer" step |
| `GROQ_API_KEY` / `GROQ_MODEL` | Provider 1 (preferred) + safety check |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Provider 2 |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Provider 3 |
| `GROQ_GUARD_MODEL` / `GROQ_GUARD_FAIL_CLOSED` | Safety classifier model / policy |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate-limit store |
| `RL_IP_HOUR` / `RL_IP_DAY` / `RL_GLOBAL_HOUR` / `RL_GLOBAL_DAY` | Limits |
| `MAX_QUERY_CHARS` / `GUARDRAIL_BLOCKLIST` | Guardrail knobs |
| `ANTHROPIC_API_KEY` / `OLLAMA_*` / `OPENAI_*` / `VOYAGE_*` | Local/alt providers |

---

## 5. Failure modes at a glance

| Situation | What the user sees |
|-----------|--------------------|
| Query too long / injection phrase | `400`, banner: filter message |
| PII in query | Silently redacted; answer proceeds |
| Per-IP or global limit hit | `429`, banner: "limit reached…" |
| Query classified unsafe (Groq) | `400`, banner: safety message |
| One provider down/limited | Transparent failover to the next |
| All providers down | Inline `[error: …]` in the answer panel |
| No Upstash configured | Rate limiting skipped (dev) |
| No provider keys configured | Falls back to local Ollama (fails on Vercel) |

---

## 6. Local development

- **Zero-key:** with nothing set, generation falls back to local Ollama
  (`ollama pull llama3.2`); rate limiting and the Groq safety check are skipped.
- **Test one hosted provider:** put its key in `apps/standalone/.env.local`.
- **Run tests:** `npm test` (engine: failover; app: guardrail).
