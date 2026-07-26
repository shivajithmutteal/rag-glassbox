import type { RetrievalParams, RetrievalTrace } from '@rag-glassbox/engine';
import { AnswerPanel } from './AnswerPanel';
import { CorpusPanel } from './CorpusPanel';
import { ModeControls } from './ModeControls';
import { RetrievalTracePanel } from './RetrievalTracePanel';

export interface GlassBoxProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Retrieve only (client-side). Also the Enter action when generation is off. */
  onRetrieve: () => void;
  /** Retrieve + generate. When set (and generationEnabled), shows the primary button and is the Enter action. */
  onGenerate?: () => void;
  loading?: boolean;
  suggestions?: string[];
  /** Hard character cap on the query, mirrored server-side by the guardrail. */
  maxQueryChars?: number;
  /** When true, show the "Retrieve + answer" primary button next to "Retrieve only". */
  generationEnabled?: boolean;

  params: RetrievalParams;
  onParamsChange: (p: RetrievalParams) => void;
  semanticDisabled?: boolean;

  corpusTitle: string;
  source: string;
  trace: RetrievalTrace | null;

  answer?: string;
  streaming?: boolean;
  retrievalOnly?: boolean;
  prompt?: string;
  repoUrl?: string;
  /** Soft notice shown in the Answer panel when generation is skipped (e.g. rate-limited). */
  answerNotice?: string;
}

/**
 * The composed three-panel glass box: corpus (left), answer (center), retrieval
 * trace (right), with a query bar and the live mode controls on top. Purely
 * presentational — the host owns state and wires the engine.
 */
export function GlassBox(props: GlassBoxProps) {
  const {
    query,
    onQueryChange,
    onRetrieve,
    onGenerate,
    loading,
    suggestions = [],
    maxQueryChars,
    generationEnabled,
    params,
    onParamsChange,
    semanticDisabled,
    corpusTitle,
    source,
    trace,
    answer,
    streaming,
    retrievalOnly,
    prompt,
    repoUrl,
    answerNotice,
  } = props;

  const busy = loading || streaming;
  const canRun = !busy && query.trim().length > 0;
  const showGenerate = Boolean(generationEnabled && onGenerate);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Enter runs the primary/default action: retrieve only. Generation is opt-in.
          onRetrieve();
        }}
        className="flex flex-col gap-2"
      >
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          maxLength={maxQueryChars}
          placeholder="Ask the documents a question…"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900"
        />
        <div className="flex items-center justify-end gap-2">
          {maxQueryChars && query.length >= maxQueryChars * 0.8 && (
            <span className="mr-auto text-[11px] text-slate-400">
              {query.length}/{maxQueryChars}
            </span>
          )}
          {showGenerate ? (
            <>
              <button
                type="button"
                onClick={onGenerate}
                disabled={!canRun}
                title="Retrieve, then generate a grounded, cited answer from only the retrieved chunks. Streams from a free-tier model; rate-limited."
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {streaming ? 'Answering…' : 'Retrieve + answer'}
              </button>
              <button
                type="submit"
                disabled={!canRun}
                title="Rank the chunks and show the trace — similarity scores and the near-misses below the cutoff — without generating an answer. Free and instant, runs in your browser."
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                Retrieve only
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={!canRun}
              title="Rank the chunks and show the trace — similarity scores and the near-misses below the cutoff."
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {loading ? 'Retrieving…' : 'Retrieve'}
            </button>
          )}
        </div>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onQueryChange(s)}
              title="Load this example question into the search box"
              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <ModeControls params={params} onChange={onParamsChange} semanticDisabled={semanticDisabled} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="max-h-[70vh] rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <CorpusPanel source={source} results={trace?.results ?? []} title={corpusTitle} />
        </section>
        <section className="max-h-[70vh] rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <AnswerPanel
            mode={params.mode}
            answer={answer}
            streaming={streaming}
            retrievalOnly={retrievalOnly}
            prompt={prompt}
            repoUrl={repoUrl}
            notice={answerNotice}
          />
        </section>
        <section className="max-h-[70vh] rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          {trace ? (
            <RetrievalTracePanel trace={trace} />
          ) : (
            <p className="text-sm text-slate-400">Run a query to see the retrieval trace.</p>
          )}
        </section>
      </div>
    </div>
  );
}
