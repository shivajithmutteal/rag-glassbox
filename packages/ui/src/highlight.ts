import type { ScoredChunk } from '@rag-glassbox/engine';

export interface HighlightSpan {
  start: number;
  end: number;
  rank: number;
}

/**
 * Turn retrieved chunks into non-overlapping source spans, sorted by position.
 * Chunks don't overlap by construction, but if they ever do, the earlier-starting
 * span wins and the later one is clipped — so a character is highlighted at most once.
 */
export function highlightSpans(results: ScoredChunk[]): HighlightSpan[] {
  const spans = results
    .map((r) => ({ start: r.chunk.charStart, end: r.chunk.charEnd, rank: r.rank }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.rank - b.rank);

  const out: HighlightSpan[] = [];
  let cursor = 0;
  for (const s of spans) {
    const start = Math.max(s.start, cursor);
    if (start >= s.end) continue;
    out.push({ start, end: s.end, rank: s.rank });
    cursor = s.end;
  }
  return out;
}

export interface Segment {
  text: string;
  /** Present when this segment is a retrieved chunk; the chunk's rank. */
  rank?: number;
}

/** Split source text into plain and highlighted segments for rendering. */
export function segmentSource(source: string, results: ScoredChunk[]): Segment[] {
  const spans = highlightSpans(results);
  const segments: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) segments.push({ text: source.slice(pos, s.start) });
    segments.push({ text: source.slice(s.start, s.end), rank: s.rank });
    pos = s.end;
  }
  if (pos < source.length) segments.push({ text: source.slice(pos) });
  return segments;
}
