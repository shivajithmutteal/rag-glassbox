import { retrieve } from './retrieve';
import type { Corpus, RetrievalParams, RetrievalTrace, ScoredChunk } from './types';
import type { EmbeddingProvider, GenerationProvider } from './providers/types';

/** Grounding instruction sent as the system prompt. */
export const RAG_SYSTEM_PROMPT =
  'You are a retrieval-augmented assistant. Answer the question using ONLY the numbered sources provided. ' +
  'Cite the sources you rely on inline with bracketed numbers like [1] or [2]. ' +
  'If the sources do not contain the answer, say you do not know rather than guessing. ' +
  'Answer directly and concisely; do not narrate your reasoning.';

/**
 * Build the user prompt sent to the model. Exposed so the glass box can show the
 * exact prompt that retrieval assembled — the step every other RAG demo hides.
 */
export function buildRagPrompt(query: string, results: ScoredChunk[]): string {
  const sources = results
    .map((r, i) => `[${i + 1}] (${r.chunk.section || 'root'})\n${r.chunk.text}`)
    .join('\n\n');
  return `Question: ${query}\n\nSources:\n${sources}\n\nAnswer the question using only the sources above, citing them with [n].`;
}

export interface AnswerInput {
  query: string;
  corpus: Corpus;
  params: RetrievalParams;
  generationProvider: GenerationProvider;
  /** Required for semantic/hybrid unless `chunkEmbeddings` are supplied. */
  embeddingProvider?: EmbeddingProvider;
  /** Precomputed chunk embeddings aligned to `corpus.chunks` (semantic/hybrid). */
  chunkEmbeddings?: number[][];
  maxTokens?: number;
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface AnswerResult {
  answer: string;
  trace: RetrievalTrace;
  /** The exact prompt sent to the generation provider. */
  prompt: string;
}

/**
 * The full RAG loop: retrieve → assemble a grounded prompt → generate. Returns the
 * answer alongside the retrieval trace and the prompt, so the caller can render the
 * whole pipeline, not just the final text.
 */
export async function answerQuestion(input: AnswerInput): Promise<AnswerResult> {
  const needsEmbeddings = input.params.mode !== 'keyword';
  let chunkEmbeddings = input.chunkEmbeddings;
  let queryEmbedding: number[] | undefined;

  if (needsEmbeddings) {
    if (!chunkEmbeddings) {
      if (!input.embeddingProvider) {
        throw new Error(
          `Mode "${input.params.mode}" needs an embeddingProvider or precomputed chunkEmbeddings.`,
        );
      }
      chunkEmbeddings = await input.embeddingProvider.embed(input.corpus.chunks.map((c) => c.text));
    }
    if (!input.embeddingProvider) {
      throw new Error(`Mode "${input.params.mode}" needs an embeddingProvider to embed the query.`);
    }
    const [q] = await input.embeddingProvider.embed([input.query]);
    queryEmbedding = q;
  }

  const trace = retrieve({
    query: input.query,
    chunks: input.corpus.chunks,
    params: input.params,
    chunkEmbeddings,
    queryEmbedding,
  });

  const prompt = buildRagPrompt(input.query, trace.results);
  const answer = await input.generationProvider.generate({
    system: RAG_SYSTEM_PROMPT,
    prompt,
    maxTokens: input.maxTokens ?? 1024,
    onToken: input.onToken,
    signal: input.signal,
  });

  return { answer, trace, prompt };
}
