import { Bm25Index } from './bm25';
import { cosine } from './vector';
import type { Chunk, RetrievalParams, RetrievalTrace, ScoredChunk } from './types';

export interface RetrieveInput {
  query: string;
  chunks: Chunk[];
  params: RetrievalParams;
  /** Prebuilt BM25 index (recommended). Built on the fly if omitted. */
  bm25?: Bm25Index;
  /** Chunk embeddings, aligned 1:1 with `chunks`. Required for semantic/hybrid. */
  chunkEmbeddings?: number[][];
  /** The query embedded with the same model as `chunkEmbeddings`. Required for semantic/hybrid. */
  queryEmbedding?: number[];
}

/**
 * Min-max normalize a score array into [0, 1]. If every value is equal, returns
 * all zeros (there is no meaningful spread to show).
 */
export function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) return values.map(() => 0);
  return values.map((v) => (v - min) / range);
}

/**
 * The glass-box retrieval step. Scores every chunk under the chosen mode, then
 * returns both the top-k that made the cut and the next few near-misses — so the
 * UI can show the cutoff line and why one chunk beat another.
 */
export function retrieve(input: RetrieveInput): RetrievalTrace {
  const { query, chunks, params } = input;
  const n = chunks.length;
  const mode = params.mode;
  const topK = Math.max(0, params.topK);
  const nearMissCount = params.nearMissCount ?? 3;
  const semanticWeight = params.semanticWeight ?? 0.5;

  let keyword: number[] | undefined;
  if (mode === 'keyword' || mode === 'hybrid') {
    const index = input.bm25 ?? new Bm25Index(chunks);
    keyword = index.score(query);
  }

  let semantic: number[] | undefined;
  if (mode === 'semantic' || mode === 'hybrid') {
    if (!input.chunkEmbeddings || !input.queryEmbedding) {
      throw new Error(
        `Retrieval mode "${mode}" requires chunkEmbeddings and queryEmbedding. ` +
          `Provide an embedding provider, or use mode "keyword".`,
      );
    }
    if (input.chunkEmbeddings.length !== n) {
      throw new Error(
        `chunkEmbeddings length (${input.chunkEmbeddings.length}) must match chunks length (${n}).`,
      );
    }
    const q = input.queryEmbedding;
    semantic = input.chunkEmbeddings.map((e) => cosine(e, q));
  }

  const kwNorm = keyword ? minMaxNormalize(keyword) : undefined;
  const semNorm = semantic ? minMaxNormalize(semantic) : undefined;

  const scored: ScoredChunk[] = chunks.map((chunk, i) => {
    let score: number;
    if (mode === 'keyword') score = kwNorm![i]!;
    else if (mode === 'semantic') score = semNorm![i]!;
    else score = semanticWeight * semNorm![i]! + (1 - semanticWeight) * kwNorm![i]!;

    return {
      chunk,
      score,
      keywordScore: keyword ? keyword[i]! : undefined,
      semanticScore: semantic ? semantic[i]! : undefined,
      rank: 0,
    };
  });

  // Stable sort by score desc, breaking ties by original index for determinism.
  scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
  scored.forEach((s, i) => (s.rank = i + 1));

  return {
    query,
    params,
    results: scored.slice(0, topK),
    nearMisses: scored.slice(topK, topK + nearMissCount),
  };
}
