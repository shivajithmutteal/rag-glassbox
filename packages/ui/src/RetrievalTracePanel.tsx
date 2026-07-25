import type { RetrievalTrace, ScoredChunk } from '@rag-glassbox/engine';
import { ScoreBar } from './ScoreBar';

function TraceRow({ r, dim }: { r: ScoredChunk; dim?: boolean }) {
  return (
    <li
      className={`rounded-lg border border-slate-200 p-3 dark:border-slate-700 ${dim ? 'opacity-55' : ''}`}
      data-rank={r.rank}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-slate-500">#{r.rank}</span>
        <span className="truncate text-xs text-slate-500" title={r.chunk.section}>
          {r.chunk.section || 'root'}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <ScoreBar value={r.score} tone={dim ? 'muted' : 'accent'} />
        <span className="w-11 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
          {r.score.toFixed(3)}
        </span>
      </div>
      <div className="mt-1 flex gap-3 font-mono text-[10px] text-slate-400">
        {r.keywordScore !== undefined && <span>bm25 {r.keywordScore.toFixed(2)}</span>}
        {r.semanticScore !== undefined && <span>cos {r.semanticScore.toFixed(3)}</span>}
      </div>
      <p className="mt-1 line-clamp-3 text-sm text-slate-700 dark:text-slate-200">{r.chunk.text}</p>
    </li>
  );
}

export interface RetrievalTracePanelProps {
  trace: RetrievalTrace;
}

/** The star panel: ranked results, the cutoff line, and the near-misses below it. */
export function RetrievalTracePanel({ trace }: RetrievalTracePanelProps) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Retrieval trace</h2>
      <ol className="flex-1 space-y-2 overflow-auto pr-1">
        {trace.results.map((r) => (
          <TraceRow key={r.chunk.id} r={r} />
        ))}
        {trace.nearMisses.length > 0 && (
          <li className="flex items-center gap-2 py-1 text-[10px] uppercase tracking-wider text-slate-400">
            <span className="h-px flex-1 bg-slate-300 dark:bg-slate-600" />
            cutoff
            <span className="h-px flex-1 bg-slate-300 dark:bg-slate-600" />
          </li>
        )}
        {trace.nearMisses.map((r) => (
          <TraceRow key={r.chunk.id} r={r} dim />
        ))}
      </ol>
    </div>
  );
}
