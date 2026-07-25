import type { RetrievalParams, RetrievalTrace } from '@rag-glassbox/engine';
import { AnswerPanel } from './AnswerPanel';
import { CorpusPanel } from './CorpusPanel';
import { ModeControls } from './ModeControls';
import { RetrievalTracePanel } from './RetrievalTracePanel';

export interface GlassBoxProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  suggestions?: string[];
  /** Hard character cap on the query, mirrored server-side by the guardrail. */
  maxQueryChars?: number;
  /** When true, show the Retrieve-only / Retrieve+answer toggle and a "Run" button. */
  generationEnabled?: boolean;
  /** Which action the Run button performs. */
  actionMode?: 'retrieve' | 'answer';
  onActionModeChange?: (mode: 'retrieve' | 'answer') => void;

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
    onSubmit,
    loading,
    suggestions = [],
    maxQueryChars,
    generationEnabled,
    actionMode = 'answer',
    onActionModeChange,
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
  const showToggle = generationEnabled && onActionModeChange;

  return (
    <div className="flex flex-col gap-4">
      {showToggle && (
        <div className="inline-flex self-start overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-600">
          {(
            [
              ['retrieve', 'Retrieve only'],
              ['answer', 'Retrieve + answer'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onActionModeChange?.(mode)}
              className={`px-3 py-1 transition-colors ${
                actionMode === mode
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-start gap-2"
      >
        <div className="flex-1">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            maxLength={maxQueryChars}
            placeholder="Ask the documents a question…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-900"
          />
          {maxQueryChars && query.length >= maxQueryChars * 0.8 && (
            <div className="mt-1 pr-1 text-right text-[11px] text-slate-400">
              {query.length}/{maxQueryChars}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {busy
            ? generationEnabled
              ? 'Running…'
              : 'Retrieving…'
            : generationEnabled
              ? 'Run'
              : 'Retrieve'}
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onQueryChange(s)}
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
