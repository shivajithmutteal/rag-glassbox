import type { RetrievalMode, RetrievalParams } from '@rag-glassbox/engine';

export interface ModeControlsProps {
  params: RetrievalParams;
  onChange: (next: RetrievalParams) => void;
  /** Disable the semantic/hybrid modes (e.g. no embedding provider configured). */
  semanticDisabled?: boolean;
}

const MODES: RetrievalMode[] = ['keyword', 'semantic', 'hybrid'];

/** Self-contained hover explanations for each retrieval mode. */
const MODE_HELP: Record<RetrievalMode, string> = {
  keyword:
    'Keyword (BM25): ranks by exact word/term overlap. Precise for specific terms, but blind to synonyms and paraphrases.',
  semantic:
    'Semantic: ranks by embedding similarity (meaning). Catches paraphrases with no shared words, but can drift off exact terms.',
  hybrid: 'Hybrid: blends the keyword and semantic scores — tune the balance with the semantic-weight slider.',
};

/** The live knobs: retrieval mode, top-k, and the hybrid fusion weight. */
export function ModeControls({ params, onChange, semanticDisabled }: ModeControlsProps) {
  const semanticWeight = params.semanticWeight ?? 0.5;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
        {MODES.map((m) => {
          const disabled = semanticDisabled && m !== 'keyword';
          const active = params.mode === m;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...params, mode: m })}
              className={`px-3 py-1 capitalize transition-colors ${
                active
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
              title={disabled ? 'No embedding provider configured' : MODE_HELP[m]}
            >
              {m}
            </button>
          );
        })}
      </div>

      <label
        title="Cutoff: how many top-ranked chunks to keep. Chunks ranked just below this line show as near-misses."
        className="flex items-center gap-2 text-slate-600 dark:text-slate-300"
      >
        top-k
        <input
          type="range"
          min={1}
          max={8}
          value={params.topK}
          onChange={(e) => onChange({ ...params, topK: Number(e.target.value) })}
        />
        <span className="w-4 font-mono tabular-nums">{params.topK}</span>
      </label>

      {params.mode === 'hybrid' && (
        <label
          title="Hybrid mix: 0 = all keyword (BM25), 1 = all semantic. In between blends the two scores."
          className="flex items-center gap-2 text-slate-600 dark:text-slate-300"
        >
          semantic&nbsp;weight
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={semanticWeight}
            onChange={(e) => onChange({ ...params, semanticWeight: Number(e.target.value) })}
          />
          <span className="w-6 font-mono tabular-nums">{semanticWeight.toFixed(1)}</span>
        </label>
      )}
    </div>
  );
}
