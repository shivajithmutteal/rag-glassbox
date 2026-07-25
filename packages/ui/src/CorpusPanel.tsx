import type { ScoredChunk } from '@rag-glassbox/engine';
import { segmentSource } from './highlight';

export interface CorpusPanelProps {
  source: string;
  results: ScoredChunk[];
  title?: string;
}

/** Renders the source document with retrieved chunks highlighted in place. */
export function CorpusPanel({ source, results, title }: CorpusPanelProps) {
  const segments = segmentSource(source, results);
  const tone = (rank: number) =>
    rank === 1
      ? 'bg-amber-200 dark:bg-amber-500/30'
      : 'bg-amber-100 dark:bg-amber-500/15';

  return (
    <div className="flex h-full flex-col">
      {title && (
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      )}
      <div className="flex-1 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        {segments.map((seg, i) =>
          seg.rank ? (
            <mark
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={`rounded px-0.5 ${tone(seg.rank)}`}
              title={`retrieved #${seg.rank}`}
            >
              {seg.text}
            </mark>
          ) : (
            // eslint-disable-next-line react/no-array-index-key
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
    </div>
  );
}
