import type { RetrievalMode } from '@rag-glassbox/engine';

export interface AnswerPanelProps {
  mode: RetrievalMode;
  answer?: string;
  streaming?: boolean;
  /** In retrieval-only mode (the hosted demo), show the CTA instead of a live answer. */
  retrievalOnly?: boolean;
  /** The prompt retrieval assembled — shown as a disclosure in retrieval-only mode. */
  prompt?: string;
  repoUrl?: string;
  /**
   * A soft notice to show in place of an answer (no answer yet) — e.g. when
   * generation is rate-limited and the page gracefully falls back to showing the
   * retrieval trace only. Rendered as an info card, not an error.
   */
  notice?: string;
}

/**
 * Shows the generated answer, or — in the hosted retrieval-only demo — a CTA that
 * points at the repo, plus the exact prompt retrieval assembled.
 */
export function AnswerPanel({ answer, streaming, retrievalOnly, prompt, repoUrl = '#', notice }: AnswerPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Answer</h2>
      {retrievalOnly ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm dark:border-slate-600">
          <p className="text-slate-600 dark:text-slate-300">
            This is where the answer gets synthesized from the retrieved sources above.
          </p>
          <p className="mt-2 text-slate-500">
            This demo stops at retrieval on purpose — the part every other RAG app hides.
          </p>
          <a
            href={repoUrl}
            className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Run the full answer locally, on your docs and your model →
          </a>
          {prompt && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500">
                Show the prompt retrieval assembled
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {prompt}
              </pre>
            </details>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto text-sm leading-relaxed text-slate-800 dark:text-slate-100">
          {answer ? (
            <p className="whitespace-pre-wrap">
              {answer}
              {streaming && <span className="ml-0.5 animate-pulse">▌</span>}
            </p>
          ) : notice ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800/60 dark:bg-amber-950/40">
              <p className="font-medium text-amber-800 dark:text-amber-200">Generation paused</p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">{notice}</p>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                The retrieval trace on the right is still live — that&apos;s the part this demo is really about.
              </p>
              <a
                href={repoUrl}
                className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
              >
                Run the full answer locally →
              </a>
            </div>
          ) : (
            <p className="text-slate-400">Ask a question to see a grounded, cited answer.</p>
          )}
        </div>
      )}
    </div>
  );
}
