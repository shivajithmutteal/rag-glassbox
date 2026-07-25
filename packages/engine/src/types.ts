/**
 * Core data model for the glass-box RAG engine.
 *
 * The engine's whole reason for existing is the {@link RetrievalTrace}: it exposes
 * not just which chunks were retrieved, but their scores and the "near-miss" chunks
 * that just failed to make the cut — the part most RAG systems hide.
 */

/** Which retrieval signal(s) to rank by. */
export type RetrievalMode = 'keyword' | 'semantic' | 'hybrid';

/** A contiguous slice of a source document, the unit of retrieval. */
export interface Chunk {
  /** Stable id, `${corpusId}:${index}`. */
  id: string;
  corpusId: string;
  /** Position of this chunk within its corpus (0-based). */
  index: number;
  /** The chunk's text content. */
  text: string;
  /** Heading path this chunk lives under, e.g. `"Dismissals > LBW"`. */
  section: string;
  /** Character offsets into the normalized (\n) source document. */
  charStart: number;
  charEnd: number;
  /** Number of tokens (by the engine's tokenizer) in the chunk. */
  tokenCount: number;
}

/** A whole document, chunked and ready to retrieve over. */
export interface Corpus {
  id: string;
  title: string;
  /** The normalized source text the chunks were derived from. */
  source: string;
  chunks: Chunk[];
}

/** A chunk with its retrieval scores and final rank. */
export interface ScoredChunk {
  chunk: Chunk;
  /** Combined, normalized score (0..1) used for ranking in the active mode. */
  score: number;
  /** Raw BM25 score, present when keyword or hybrid retrieval ran. */
  keywordScore?: number;
  /** Raw cosine similarity, present when semantic or hybrid retrieval ran. */
  semanticScore?: number;
  /** 1-based rank across the full candidate set. */
  rank: number;
}

/** Knobs the demo exposes to the user. */
export interface RetrievalParams {
  mode: RetrievalMode;
  /** How many chunks "make the cut" and feed the answer. */
  topK: number;
  /**
   * Hybrid fusion weight for the semantic signal (0..1); the keyword weight is
   * `1 - semanticWeight`. Ignored outside hybrid mode. Defaults to 0.5.
   */
  semanticWeight?: number;
  /** How many below-cutoff chunks to include in the trace as near-misses. Defaults to 3. */
  nearMissCount?: number;
}

/** The glass-box output: everything the UI needs to show how retrieval worked. */
export interface RetrievalTrace {
  query: string;
  params: RetrievalParams;
  /** The top-k chunks that made the cut, ranked best-first. */
  results: ScoredChunk[];
  /** The next `nearMissCount` chunks that just missed — the cutoff made visible. */
  nearMisses: ScoredChunk[];
}
