/** Provider contracts — the seams that make the engine model-agnostic. */

/** Turns text into vectors for semantic retrieval. */
export interface EmbeddingProvider {
  /** Stable id, e.g. `'ollama'`, `'voyage'`, `'openai'`. */
  readonly id: string;
  readonly model: string;
  /** Embed one or more texts; returns vectors aligned to input order. */
  embed(texts: string[]): Promise<number[][]>;
}

export interface GenerateInput {
  /** System / grounding instruction. */
  system?: string;
  /** The user prompt (question + retrieved context). */
  prompt: string;
  maxTokens?: number;
  /** Called with each streamed token delta, if the provider streams. */
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
}

/** Produces the final answer from a grounded prompt. */
export interface GenerationProvider {
  readonly id: string;
  readonly model: string;
  /** Generate a completion; streams via `onToken` and resolves with the full text. */
  generate(input: GenerateInput): Promise<string>;
}
