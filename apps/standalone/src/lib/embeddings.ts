import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCorpus } from './corpora';
import { getServerEmbeddingProvider } from './providers';
import type { RetrievalParams } from '@rag-glassbox/engine';

interface PrecomputedEmbeddings {
  model: string;
  dims: number;
  vectors: number[][];
}

function embeddingsFile(corpusId: string): string {
  return resolve(process.cwd(), '..', '..', 'corpus', corpusId, 'embeddings.json');
}

export function loadPrecomputed(corpusId: string): PrecomputedEmbeddings | null {
  const file = embeddingsFile(corpusId);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as PrecomputedEmbeddings;
}

/** Corpora embedded on the fly via a hosted provider (only when no precompute matches). */
const chunkCache = new Map<string, number[][]>();

/**
 * Resolve the chunk + query embeddings a retrieval needs, for both routes.
 *
 * - Keyword mode → nothing to embed.
 * - Hosted provider configured (Voyage/OpenAI) → embed chunks (cached) and query on the server.
 * - Local (no key) → use committed precomputed chunk vectors + a query vector the
 *   browser computed with the same model. No model runs in the Node server.
 */
export async function resolveEmbeddings(
  corpusId: string,
  query: string,
  params: RetrievalParams,
  clientQueryEmbedding?: number[],
): Promise<{ chunkEmbeddings?: number[][]; queryEmbedding?: number[] }> {
  if (params.mode === 'keyword') return {};

  const provider = getServerEmbeddingProvider();
  if (provider) {
    const key = `${corpusId}:${provider.id}:${provider.model}`;
    let chunkEmbeddings = chunkCache.get(key);
    if (!chunkEmbeddings) {
      const corpus = loadCorpus(corpusId);
      chunkEmbeddings = await provider.embed(corpus.chunks.map((c) => c.text));
      chunkCache.set(key, chunkEmbeddings);
    }
    const [queryEmbedding] = await provider.embed([query]);
    return { chunkEmbeddings, queryEmbedding };
  }

  const pre = loadPrecomputed(corpusId);
  if (!pre) {
    throw new Error(
      'Semantic mode needs embeddings — run `npm run build:embeddings`, or set VOYAGE_API_KEY / OPENAI_API_KEY.',
    );
  }
  if (!Array.isArray(clientQueryEmbedding) || clientQueryEmbedding.length === 0) {
    throw new Error(
      'Semantic mode embeds the query in your browser. Wait for the in-browser model to load, or set a hosted embedding key.',
    );
  }
  return { chunkEmbeddings: pre.vectors, queryEmbedding: clientQueryEmbedding };
}
