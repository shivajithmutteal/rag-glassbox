import { ensureOk, readLines, type FetchImpl } from './http';
import type { EmbeddingProvider, GenerateInput, GenerationProvider } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}

/** OpenAI embeddings — an override for the local default when a key is present. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: OpenAIEmbeddingOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'text-embedding-3-small';
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
      'OpenAI embed',
    );
    const data = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return data.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

export interface OpenAIGenerationOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  /**
   * Provider id for display/observability. Defaults to `'openai'`, but any
   * OpenAI-compatible host (Groq, Gemini's compat endpoint, OpenRouter) reuses
   * this class with its own `baseUrl` — pass `id` so a failover chain can report
   * *which* host served or failed, e.g. `['groq', 'gemini', 'openrouter']`.
   */
  id?: string;
}

/** OpenAI-compatible chat completions (streaming). Reused for any host that speaks the same shape. */
export class OpenAIGenerationProvider implements GenerationProvider {
  readonly id: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: OpenAIGenerationOptions) {
    this.id = opts.id ?? 'openai';
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gpt-4o-mini';
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(input: GenerateInput): Promise<string> {
    const messages = [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content: input.prompt },
    ];
    const res = await ensureOk(
      await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        }),
        signal: input.signal,
      }),
      'OpenAI generate',
    );

    let text = '';
    for await (const line of readLines(res)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') break;
      let obj: { choices?: { delta?: { content?: string } }[] };
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = obj.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        text += delta;
        input.onToken?.(delta);
      }
    }
    return text;
  }
}
