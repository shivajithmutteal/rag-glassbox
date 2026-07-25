/** Public API of the glass-box RAG engine. */

export type {
  Chunk,
  Corpus,
  ScoredChunk,
  RetrievalMode,
  RetrievalParams,
  RetrievalTrace,
} from './types';

export { tokenize } from './tokenize';
export { chunkCorpus } from './chunk';
export type { ChunkOptions } from './chunk';
export { Bm25Index } from './bm25';
export type { Bm25Options } from './bm25';
export { cosine, dot, norm } from './vector';
export { retrieve, minMaxNormalize } from './retrieve';
export type { RetrieveInput } from './retrieve';

// Providers (model-agnostic seams)
export type { EmbeddingProvider, GenerationProvider, GenerateInput } from './providers/types';
export type { FetchImpl } from './providers/http';
export { OllamaEmbeddingProvider, OllamaGenerationProvider } from './providers/ollama';
export { OpenAIEmbeddingProvider, OpenAIGenerationProvider } from './providers/openai';
export { VoyageEmbeddingProvider } from './providers/voyage';
export { resolveEmbeddingProvider, resolveGenerationProvider } from './providers/resolve';
export type { ProviderEnv } from './providers/resolve';

// RAG pipeline
export { answerQuestion, buildRagPrompt, RAG_SYSTEM_PROMPT } from './rag';
export type { AnswerInput, AnswerResult } from './rag';
