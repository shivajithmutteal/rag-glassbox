import type { Corpus } from '@rag-glassbox/engine';

/** The demo corpora, served as static JSON from /public/rag/<id>/. */
export interface CorpusMeta {
  id: string;
  title: string;
}

export const CORPORA: CorpusMeta[] = [
  { id: 'cricket', title: 'Cricket' },
  { id: 'football', title: 'Football' },
  { id: 'morse', title: 'Morse code' },
];

const corpusCache = new Map<string, Corpus>();
const embeddingsCache = new Map<string, number[][]>();

/** Fetch a corpus (source + chunks) from the static assets. Cached after first load. */
export async function loadCorpus(id: string): Promise<Corpus> {
  const hit = corpusCache.get(id);
  if (hit) return hit;
  const res = await fetch(`/rag/${id}/chunks.json`);
  if (!res.ok) throw new Error(`Failed to load corpus "${id}" (${res.status})`);
  const corpus = (await res.json()) as Corpus;
  corpusCache.set(id, corpus);
  return corpus;
}

/** Fetch precomputed chunk embeddings (only needed for semantic/hybrid). Cached. */
export async function loadEmbeddings(id: string): Promise<number[][]> {
  const hit = embeddingsCache.get(id);
  if (hit) return hit;
  const res = await fetch(`/rag/${id}/embeddings.json`);
  if (!res.ok) throw new Error(`Failed to load embeddings for "${id}" (${res.status})`);
  const data = (await res.json()) as { vectors: number[][] };
  embeddingsCache.set(id, data.vectors);
  return data.vectors;
}
