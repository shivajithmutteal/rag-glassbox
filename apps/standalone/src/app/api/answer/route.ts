import { RAG_SYSTEM_PROMPT, buildRagPrompt, retrieve } from '@rag-glassbox/engine';
import type { RetrievalParams } from '@rag-glassbox/engine';
import { loadCorpus } from '@/lib/corpora';
import { resolveEmbeddings } from '@/lib/embeddings';
import { getGenerationProvider } from '@/lib/providers';
import { applyGuardrails, defaultGuardrailConfig } from '@/lib/guardrail';
import { checkRateLimits, defaultRateLimitConfig } from '@/lib/ratelimit';
import { maybeGroqSafetyCheck } from '@/lib/groq-safety';

// This route reads corpus files from disk (node:fs) and calls provider SDKs, so
// it must run on the Node.js serverless runtime, not the Edge runtime. Stating it
// explicitly stops anyone flipping it to 'edge' and breaking the filesystem reads.
export const runtime = 'nodejs';
// Never cache — every request runs the guardrail/rate-limit/generation pipeline.
export const dynamic = 'force-dynamic';

function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

/** First hop of X-Forwarded-For is the real client on Vercel; fall back safely. */
function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(req: Request) {
  let body: { corpusId?: string; query?: string; params?: RetrievalParams; queryEmbedding?: number[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const { corpusId, query, params, queryEmbedding } = body;
  if (typeof corpusId !== 'string' || typeof query !== 'string' || !params) {
    return json({ error: 'Missing corpusId, query, or params.' }, 400);
  }

  // 1) Local guardrail: length cap + PII redaction + blocklist. Cheap, always on.
  const guard = applyGuardrails(query, defaultGuardrailConfig());
  if (!guard.ok) return json({ error: guard.reason, code: guard.code }, 400);
  const cleanQuery = guard.query; // possibly PII-redacted; used everywhere downstream

  // 2) Rate limits: per-IP + global, hour + day.
  const verdict = await checkRateLimits(clientIp(req), defaultRateLimitConfig());
  if (!verdict.ok) {
    return json(
      { error: verdict.reason, scope: verdict.scope, window: verdict.window },
      429,
      { 'retry-after': String(verdict.retryAfterSec) },
    );
  }

  // 3) Groq safety check (only when Groq is configured). Runs before streaming so
  //    a block returns a clean 400 rather than an error mid-answer.
  const safety = await maybeGroqSafetyCheck(cleanQuery);
  if (!safety.safe) return json({ error: safety.reason, code: 'unsafe' }, 400);

  // 4) + 5) Retrieve → build grounded prompt → stream the failover generation.
  const corpus = loadCorpus(corpusId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const { chunkEmbeddings, queryEmbedding: qe } = await resolveEmbeddings(
          corpusId,
          cleanQuery,
          params,
          queryEmbedding,
        );
        const trace = retrieve({ query: cleanQuery, chunks: corpus.chunks, params, chunkEmbeddings, queryEmbedding: qe });
        const prompt = buildRagPrompt(cleanQuery, trace.results);
        const provider = await getGenerationProvider();
        await provider.generate({
          system: RAG_SYSTEM_PROMPT,
          prompt,
          onToken: (delta) => controller.enqueue(encoder.encode(delta)),
        });
      } catch (e) {
        // Reached only if all providers in the chain failed (or a mid-stream
        // error after tokens began). The 200 status is already sent, so surface
        // it inline for the client to show in the answer panel.
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`\n\n[error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
