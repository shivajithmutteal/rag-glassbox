import { describe, expect, it, vi } from 'vitest';
import {
  OllamaEmbeddingProvider,
  OllamaGenerationProvider,
  OpenAIEmbeddingProvider,
  OpenAIGenerationProvider,
  VoyageEmbeddingProvider,
} from '../src/index.js';
import type { FetchImpl } from '../src/index.js';

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('embedding providers', () => {
  it('OllamaEmbeddingProvider posts to /api/embed and returns embeddings', async () => {
    let calledUrl = '';
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      calledUrl = String(url);
      return jsonResponse({ embeddings: [[1, 2], [3, 4]] });
    });
    const provider = new OllamaEmbeddingProvider({ fetchImpl: fetchImpl as unknown as FetchImpl });
    const out = await provider.embed(['a', 'b']);
    expect(out).toEqual([[1, 2], [3, 4]]);
    expect(calledUrl).toContain('/api/embed');
  });

  it('OpenAIEmbeddingProvider sorts vectors by the returned index', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { index: 1, embedding: [9] },
          { index: 0, embedding: [1] },
        ],
      }),
    );
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as FetchImpl });
    expect(await provider.embed(['a', 'b'])).toEqual([[1], [9]]);
  });

  it('VoyageEmbeddingProvider parses data[].embedding', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ index: 0, embedding: [0.1, 0.2] }] }));
    const provider = new VoyageEmbeddingProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as FetchImpl });
    expect(await provider.embed(['x'])).toEqual([[0.1, 0.2]]);
  });

  it('throws a helpful error on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' }));
    const provider = new OllamaEmbeddingProvider({ fetchImpl: fetchImpl as unknown as FetchImpl });
    await expect(provider.embed(['a'])).rejects.toThrow(/Ollama embed failed: 500/);
  });

  it('embed([]) short-circuits without a request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ embeddings: [] }));
    const provider = new OllamaEmbeddingProvider({ fetchImpl: fetchImpl as unknown as FetchImpl });
    expect(await provider.embed([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('generation providers (streaming)', () => {
  it('OllamaGenerationProvider accumulates NDJSON deltas and fires onToken', async () => {
    const ndjson =
      [
        JSON.stringify({ message: { content: 'Hel' }, done: false }),
        JSON.stringify({ message: { content: 'lo' }, done: false }),
        JSON.stringify({ message: { content: '' }, done: true }),
      ].join('\n') + '\n';
    const fetchImpl = vi.fn(async () => new Response(ndjson, { status: 200 }));
    const provider = new OllamaGenerationProvider({ fetchImpl: fetchImpl as unknown as FetchImpl });
    const tokens: string[] = [];
    const text = await provider.generate({ prompt: 'hi', onToken: (d) => tokens.push(d) });
    expect(text).toBe('Hello');
    expect(tokens).toEqual(['Hel', 'lo']);
  });

  it('OpenAIGenerationProvider parses SSE data lines until [DONE]', async () => {
    const sse =
      [
        'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Wor' } }] }),
        'data: ' + JSON.stringify({ choices: [{ delta: { content: 'ld' } }] }),
        'data: [DONE]',
      ].join('\n') + '\n';
    const fetchImpl = vi.fn(async () => new Response(sse, { status: 200 }));
    const provider = new OpenAIGenerationProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as FetchImpl });
    const text = await provider.generate({ prompt: 'hi' });
    expect(text).toBe('World');
  });
});
