import { describe, expect, it } from 'vitest';
import { highlightSpans, segmentSource } from '../src/highlight.js';
import type { Chunk, ScoredChunk } from '@rag-glassbox/engine';

const SRC = '0123456789';

function sc(start: number, end: number, rank: number): ScoredChunk {
  const chunk: Chunk = {
    id: `c${rank}`,
    corpusId: 'c',
    index: rank,
    text: SRC.slice(start, end),
    section: '',
    charStart: start,
    charEnd: end,
    tokenCount: 1,
  };
  return { chunk, score: 1, rank };
}

describe('segmentSource', () => {
  it('reconstructs the full source and marks highlighted spans with ranks', () => {
    const segments = segmentSource(SRC, [sc(2, 4, 1), sc(6, 8, 2)]);
    expect(segments.map((s) => s.text).join('')).toBe(SRC);
    const marked = segments.filter((s) => s.rank !== undefined);
    expect(marked.map((s) => s.text)).toEqual(['23', '67']);
    expect(marked.map((s) => s.rank)).toEqual([1, 2]);
  });

  it('handles no results (whole source is one plain segment)', () => {
    expect(segmentSource(SRC, [])).toEqual([{ text: SRC }]);
  });
});

describe('highlightSpans', () => {
  it('clips overlapping spans so a character is highlighted at most once', () => {
    const spans = highlightSpans([sc(2, 6, 2), sc(4, 8, 1)]);
    expect(spans).toEqual([
      { start: 2, end: 6, rank: 2 },
      { start: 6, end: 8, rank: 1 },
    ]);
  });
});
