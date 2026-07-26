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

  // "Retrieve + answer": client-side retrieval fills the trace (free, instant),
  // then the gated server generation streams the answer into it.
  async function runGenerate() {
    await runRetrieve();
    await runAnswer();
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Glass-box RAG</h1>
        <div className="group relative mt-1 max-w-2xl">
          <p className="cursor-help text-sm text-slate-500 dark:text-slate-400">
            Every RAG app shows you the answer and hides the retrieval. This one does the
            opposite — watch each chunk get ranked and scored, catch the near-misses just below
            the cutoff, and see exactly where keyword (BM25), semantic, and hybrid break on the
            same question. Then stream a grounded, cited answer built from the sources it actually
            retrieved.{' '}
            <button
              type="button"
              className="whitespace-nowrap align-baseline text-[11px] font-medium text-slate-400 underline decoration-dotted underline-offset-2 outline-none transition-colors hover:text-slate-600 focus-visible:text-slate-600 dark:hover:text-slate-200"
            >
              ⓘ how it works
            </button>
          </p>

          <div
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-[min(36rem,92vw)] translate-y-1 rounded-xl border border-slate-200 bg-white/95 p-4 text-xs leading-relaxed text-slate-600 opacity-0 shadow-xl backdrop-blur transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300"
          >
            <p className="font-medium text-slate-700 dark:text-slate-200">Under the hood</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 marker:text-slate-300 dark:marker:text-slate-600">
              <li>
                <strong className="font-medium text-slate-700 dark:text-slate-200">Retrieval</strong> runs
                entirely in your browser — BM25 for keyword, MiniLM embeddings for semantic, and a weighted
                blend for hybrid. No keys, no setup.
              </li>
              <li>
                <strong className="font-medium text-slate-700 dark:text-slate-200">The trace</strong> shows
                every chunk with its similarity score, plus the near-misses that fell just below the top-k
                cutoff — the step other RAG apps hide.
              </li>
              <li>
                <strong className="font-medium text-slate-700 dark:text-slate-200">The answer</strong> is
                generated from only the retrieved chunks and streamed with inline citations, on a free-tier
                model with automatic failover.
              </li>
              <li>
                <strong className="font-medium text-slate-700 dark:text-slate-200">Corpora</strong>: cricket,
                football, and Morse code — compact, fact-checked docs where retrieval visibly succeeds and
                fails.
              </li>
            </ul>
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CORPORA.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCorpusId(c.id)}
            title={`Search the ${c.title} document set — swaps the corpus the query runs against`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              c.id === corpusId
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <GlassBox
        query={query}
        onQueryChange={setQuery}
        onRetrieve={runRetrieve}
        onGenerate={GENERATION_ENABLED ? runGenerate : undefined}
        loading={loading}
        suggestions={SUGGESTIONS[corpusId] ?? []}
        maxQueryChars={MAX_QUERY_CHARS}
        generationEnabled={GENERATION_ENABLED}
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
