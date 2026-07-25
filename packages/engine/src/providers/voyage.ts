import { ensureOk, type FetchImpl } from './http';
import type { EmbeddingProvider } from './types';

const DEFAULT_BASE = 'https://api.voyageai.com/v1';

export interface VoyageEmbeddingOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}

/**
 * Voyage AI embeddings — Anthropic's recommended embedding provider (Anthropic has
 * no first-party embeddings API). An override for the local default when a key is present.
 */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'voyage';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: VoyageEmbeddingOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'voyage-3.5-lite';
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await ensureOk(
      await this.fetchImpl(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, input: texts }),
      }),
      'Voyage embed',
    );
    const data = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return data.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
