'use client';

import { useEffect, useState } from 'react';
import { GlassBox } from '@rag-glassbox/ui';
import { buildRagPrompt, retrieve } from '@rag-glassbox/engine';
import type { Corpus, RetrievalParams, RetrievalTrace } from '@rag-glassbox/engine';
import { embedQuery } from '@/lib/browser-embed';
import { CORPORA, loadCorpus, loadEmbeddings } from '@/lib/corpora-client';

const REPO_URL = 'https://github.com/shivajithmutteal/rag-glassbox';

// Retrieval runs entirely in the browser (BM25 + precomputed vectors + in-browser
// query embedding), so this deploys anywhere as static + client, with no server AI.
// Set NEXT_PUBLIC_ENABLE_GENERATION=true locally (with Ollama or an API key) to also
// show the "Generate answer" step, which calls the /api/answer route.
const GENERATION_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GENERATION === 'true';

// Hard cap on the query length, mirrored server-side by the guardrail (the client
// value is just UX — the server re-checks and never trusts it).
const MAX_QUERY_CHARS = 500;

const SUGGESTIONS: Record<string, string[]> = {
  cricket: [
    'How many players are on a team?',
    'What is leg before wicket?',
    'The ball hits the pad and would have hit the stumps',
    'How does a team win?',
  ],
  football: [
    'What is the offside rule?',
    'When is a red card shown?',
    'How long is a match?',
    'What is a direct free kick?',
  ],
  morse: [
    'What is the code for the letter Q?',
    'How do the timing rules work?',
    'What is SOS?',
    'What is the Koch method?',
  ],
};

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function Studio() {
  const [corpusId, setCorpusId] = useState(CORPORA[0].id);
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [query, setQuery] = useState('What is leg before wicket?');
  const [params, setParams] = useState<RetrievalParams>({
    mode: 'keyword',
    topK: 3,
    nearMissCount: 2,
    semanticWeight: 0.5,
  });
  const [trace, setTrace] = useState<RetrievalTrace | null>(null);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Soft, non-error notice shown in the Answer panel when generation is skipped
  // (e.g. rate-limited) — the page stays usable in retrieval-only mode.
  const [answerNotice, setAnswerNotice] = useState<string | null>(null);

  // Load the selected corpus (source + chunks) from the static assets.
  useEffect(() => {
    let cancelled = false;
    setCorpus(null);
    setTrace(null);
    setAnswer('');
    setError(null);
    setAnswerNotice(null);
    loadCorpus(corpusId)
      .then((c) => {
        if (!cancelled) setCorpus(c);
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      });
    return () => {
      cancelled = true;
    };
  }, [corpusId]);

  async function runRetrieve() {
    if (!corpus || !query.trim()) return;
    setLoading(true);
    setError(null);
    setAnswerNotice(null);
    setAnswer('');
    try {
      let chunkEmbeddings: number[][] | undefined;
      let queryEmbedding: number[] | undefined;
      if (params.mode !== 'keyword') {
        [chunkEmbeddings, queryEmbedding] = await Promise.all([
          loadEmbeddings(corpusId),
          embedQuery(query),
        ]);
      }
      setTrace(retrieve({ query, chunks: corpus.chunks, params, chunkEmbeddings, queryEmbedding }));
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }

  // Local-only (gated) full RAG loop: streams a grounded answer from /api/answer.
  async function runAnswer() {
    if (!query.trim()) return;
    setStreaming(true);
    setAnswer('');
    setError(null);
    setAnswerNotice(null);
    try {
      let queryEmbedding: number[] | undefined;
      if (params.mode !== 'keyword') queryEmbedding = await embedQuery(query);
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ corpusId, query, params, queryEmbedding }),
      });
      // Rejections come back before any stream, as JSON. A 429 (rate limit) is
      // expected on a free demo — fall back to retrieval-only with a soft notice
      // in the Answer panel, keeping the (already-computed) trace on screen. Other
      // rejections (400 guardrail: too long / blocked / unsafe) are input problems,
      // so those go to the error banner.
      if (!res.ok) {
        let reason = `Request failed (${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) reason = data.error;
        } catch {
          // non-JSON body — keep the generic reason
        }
        if (res.status === 429) setAnswerNotice(reason);
        else setError(reason);
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          setAnswer((a) => a + decoder.decode(value, { stream: true }));
        }
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Glass-box RAG</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          See the retrieval step — ranked chunks, scores, and the near-misses just below the cutoff —
          not just the final answer. Flip between keyword (BM25), semantic, and hybrid and watch where
          each one breaks on the same question. Runs entirely in your browser: no keys, no server calls.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CORPORA.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCorpusId(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              c.id === corpusId
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {c.title}
          </button>
        ))}
        {GENERATION_ENABLED && (
          <>
            <div className="grow" />
            <button
              type="button"
              onClick={runAnswer}
              disabled={!trace || streaming}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
              title="Runs the full RAG loop (needs a local model or an API key)"
            >
              {streaming ? 'Generating…' : 'Generate answer'}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <GlassBox
        query={query}
        onQueryChange={setQuery}
        onSubmit={runRetrieve}
        loading={loading}
        suggestions={SUGGESTIONS[corpusId] ?? []}
        maxQueryChars={MAX_QUERY_CHARS}
        params={params}
        onParamsChange={setParams}
        corpusTitle={corpus?.title ?? 'Corpus'}
        source={corpus?.source ?? ''}
        trace={trace}
        answer={answer || undefined}
        answerNotice={answerNotice ?? undefined}
        streaming={streaming}
        retrievalOnly={!GENERATION_ENABLED}
        prompt={!GENERATION_ENABLED && trace ? buildRagPrompt(query, trace.results) : undefined}
        repoUrl={REPO_URL}
      />
    </main>
  );
}
