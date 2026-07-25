'use client';

import { useState } from 'react';
import { GlassBox } from '@rag-glassbox/ui';
import type { RetrievalParams, RetrievalTrace } from '@rag-glassbox/engine';

const REPO_URL = 'https://github.com/';

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

interface CorpusMeta {
  id: string;
  title: string;
}

interface StudioProps {
  corpora: CorpusMeta[];
  initial: { id: string; title: string; source: string };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function Studio({ corpora, initial }: StudioProps) {
  const [corpusId, setCorpusId] = useState(initial.id);
  const [title, setTitle] = useState(initial.title);
  const [source, setSource] = useState(initial.source);
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

  async function switchCorpus(id: string) {
    if (id === corpusId) return;
    setError(null);
    setTrace(null);
    setAnswer('');
    setCorpusId(id);
    try {
      const res = await fetch(`/api/corpus?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      setTitle(data.title);
      setSource(data.source);
    } catch (e) {
      setError(message(e));
    }
  }

  // Semantic/hybrid modes embed the query in the browser (same model as the corpus
  // precompute); keyword mode needs no vector.
  async function computeQueryEmbedding(): Promise<number[] | undefined> {
    if (params.mode === 'keyword') return undefined;
    const { embedQuery } = await import('@/lib/browser-embed');
    return embedQuery(query);
  }

  async function runRetrieve() {
    setLoading(true);
    setError(null);
    setAnswer('');
    try {
      const queryEmbedding = await computeQueryEmbedding();
      const res = await fetch('/api/retrieve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ corpusId, query, params, queryEmbedding }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setTrace((await res.json()).trace);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }

  async function runAnswer() {
    setStreaming(true);
    setAnswer('');
    setError(null);
    try {
      const queryEmbedding = await computeQueryEmbedding();
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ corpusId, query, params, queryEmbedding }),
      });
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
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          See the retrieval step — ranked chunks, scores, and the near-misses just below the cutoff —
          not just the final answer.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {corpora.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => switchCorpus(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              c.id === corpusId
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {c.title}
          </button>
        ))}
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
        params={params}
        onParamsChange={setParams}
        corpusTitle={title}
        source={source}
        trace={trace}
        answer={answer || undefined}
        streaming={streaming}
        repoUrl={REPO_URL}
      />
    </main>
  );
}
