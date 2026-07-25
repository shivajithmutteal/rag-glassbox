export interface ScoreBarProps {
  /** Normalized score in [0, 1]. */
  value: number;
  tone?: 'accent' | 'muted';
}

/** A slim horizontal bar visualizing a normalized retrieval score. */
export function ScoreBar({ value, tone = 'accent' }: ScoreBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = tone === 'accent' ? 'bg-blue-500' : 'bg-slate-400';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
      <div className={`h-full rounded ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
