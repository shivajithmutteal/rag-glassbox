import { describe, expect, it } from 'vitest';
import { retrieve, tokenize } from '../src/index.js';
import type { Chunk } from '../src/index.js';

function mk(index: number, text: string): Chunk {
  return {
    id: `t:${index}`,
    corpusId: 't',
    index,
    text,
    section: '',
    charStart: 0,
    charEnd: text.length,
    tokenCount: tokenize(text).length,
  };
}

const CHUNKS: Chunk[] = [
  mk(0, 'Eleven players form a cricket team.'),
  mk(1, 'LBW is a dismissal method in cricket.'),
  mk(2, 'Offside is a rule in football.'),
];

// Toy embeddings aligned to CHUNKS. The query embedding points at chunk 2.
const EMB = [
  [1, 0],
  [0.7, 0.7],
  [0, 1],
];
const QUERY_EMB = [0, 1];

describe('retrieve', () => {
  it('keyword mode splits results and near-misses and ranks by score', () => {
    const trace = retrieve({
      query: 'dismissal',
      chunks: CHUNKS,
      params: { mode: 'keyword', topK: 1, nearMissCount: 2 },
    });
    expect(trace.results).toHaveLength(1);
    expect(trace.nearMisses).toHaveLength(2);
    expect(trace.results[0]!.chunk.index).toBe(1);
    expect(trace.results[0]!.rank).toBe(1);
    // Full ranking is monotonically non-increasing in score.
    const all = [...trace.results, ...trace.nearMisses];
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.score).toBeGreaterThanOrEqual(all[i]!.score);
    }
  });

  it('semantic mode throws without embeddings', () => {
    expect(() =>
      retrieve({ query: 'q', chunks: CHUNKS, params: { mode: 'semantic', topK: 1 } }),
    ).toThrow(/requires chunkEmbeddings/);
  });

  it('semantic mode ranks by cosine similarity to the query embedding', () => {
    const trace = retrieve({
      query: 'q',
      chunks: CHUNKS,
      params: { mode: 'semantic', topK: 1 },
      chunkEmbeddings: EMB,
      queryEmbedding: QUERY_EMB,
    });
    expect(trace.results[0]!.chunk.index).toBe(2);
    expect(trace.results[0]!.semanticScore).toBeCloseTo(1, 5);
  });

  it('hybrid collapses to keyword or semantic ordering at the weight extremes', () => {
    const base = {
      query: 'dismissal',
      chunks: CHUNKS,
      chunkEmbeddings: EMB,
      queryEmbedding: QUERY_EMB,
    };
    const keywordLike = retrieve({ ...base, params: { mode: 'hybrid', topK: 1, semanticWeight: 0 } });
    const semanticLike = retrieve({ ...base, params: { mode: 'hybrid', topK: 1, semanticWeight: 1 } });
    expect(keywordLike.results[0]!.chunk.index).toBe(1); // keyword term "dismissal" -> chunk 1
    expect(semanticLike.results[0]!.chunk.index).toBe(2); // query embedding -> chunk 2
  });
});
