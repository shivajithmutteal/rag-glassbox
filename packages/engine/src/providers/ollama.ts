import { ensureOk, readLines, type FetchImpl } from './http';
import type { EmbeddingProvider, GenerateInput, GenerationProvider } from './types';

const DEFAULT_HOST = 'http://localhost:11434';

export interface OllamaEmbeddingOptions {
  host?: string;
  model?: string;
  fetchImpl?: FetchImpl;
}

/** Local embeddings via a running Ollama server — the zero-key default. */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'ollama';
  readonly model: string;
  private readonly host: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: OllamaEmbeddingOptions = {}) {
    this.host = (opts.host ?? DEFAULT_HOST).replace(/\/+$/, '');
    this.model = opts.model ?? 'nomic-embed-text';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await ensureOk(
      await this.fetchImpl(`${this.host}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: texts }),
      }),
      'Ollama embed',
    );
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!data.embeddings) throw new Error('Ollama embed: response missing "embeddings"');
    return data.embeddings;
  }
}

export interface OllamaGenerationOptions {
  host?: string;
  model?: string;
  fetchImpl?: FetchImpl;
}

/** Local text generation via Ollama's streaming chat endpoint — the zero-key default. */
export class OllamaGenerationProvider implements GenerationProvider {
  readonly id = 'ollama';
  readonly model: string;
  private readonly host: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: OllamaGenerationOptions = {}) {
    this.host = (opts.host ?? DEFAULT_HOST).replace(/\/+$/, '');
    this.model = opts.model ?? 'llama3.2';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(input: GenerateInput): Promise<string> {
    const messages = [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content: input.prompt },
    ];
    const res = await ensureOk(
      await this.fetchImpl(`${this.host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          ...(input.maxTokens ? { options: { num_predict: input.maxTokens } } : {}),
        }),
        signal: input.signal,
      }),
      'Ollama generate',
    );

    let text = '';
    for await (const line of readLines(res)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj: { message?: { content?: string }; done?: boolean };
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const delta = obj.message?.content ?? '';
      if (delta) {
        text += delta;
        input.onToken?.(delta);
      }
      if (obj.done) break;
    }
    return text;
  }
}
