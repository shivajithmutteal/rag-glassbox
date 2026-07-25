import { tokenize } from './tokenize';
import type { Chunk } from './types';

export interface Bm25Options {
  /** Term-frequency saturation. Default 1.5. */
  k1?: number;
  /** Length normalization. Default 0.75. */
  b?: number;
}

/**
 * A BM25 lexical index over a set of chunks. Pure, deterministic, and
 * dependency-free — this is the keyword-retrieval half of the glass box, and the
 * path that works with zero setup (no embedding model, no API key).
 */
export class Bm25Index {
  private readonly chunks: Chunk[];
  private readonly docLen: number[];
  private readonly tf: Array<Map<string, number>>;
  private readonly df: Map<string, number>;
  private readonly avgDocLen: number;
  private readonly N: number;
  private readonly k1: number;
  private readonly b: number;

  constructor(chunks: Chunk[], opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.5;
    this.b = opts.b ?? 0.75;
    this.chunks = chunks;
    this.N = chunks.length;
    this.df = new Map();

    this.tf = chunks.map((chunk) => {
      const counts = new Map<string, number>();
      for (const term of tokenize(chunk.text)) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
      for (const term of counts.keys()) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
      return counts;
    });

    this.docLen = this.tf.map((counts) => {
      let len = 0;
      for (const c of counts.values()) len += c;
      return len;
    });
    const totalLen = this.docLen.reduce((a, l) => a + l, 0);
    this.avgDocLen = this.N > 0 ? totalLen / this.N : 0;
  }

  private idf(term: string): number {
    const df = this.df.get(term) ?? 0;
    // BM25 IDF with +0.5 smoothing; the +1 keeps it non-negative for common terms.
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  /** Score every chunk against the query. Chunks with no query terms score 0. */
  score(query: string): number[] {
    const scores = new Array<number>(this.N).fill(0);
    if (this.N === 0 || this.avgDocLen === 0) return scores;

    for (const term of tokenize(query)) {
      const idf = this.idf(term);
      if (idf <= 0) continue;
      for (let i = 0; i < this.N; i++) {
        const f = this.tf[i]!.get(term) ?? 0;
        if (f === 0) continue;
        const denom = f + this.k1 * (1 - this.b + this.b * (this.docLen[i]! / this.avgDocLen));
        scores[i]! += idf * ((f * (this.k1 + 1)) / denom);
      }
    }
    return scores;
  }
}
