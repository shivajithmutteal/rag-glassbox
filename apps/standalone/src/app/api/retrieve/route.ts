import { retrieve } from '@rag-glassbox/engine';
import type { RetrievalParams } from '@rag-glassbox/engine';
import { loadCorpus } from '@/lib/corpora';
import { resolveEmbeddings } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { corpusId, query, params, queryEmbedding } = (await req.json()) as {
      corpusId: string;
      query: string;
      params: RetrievalParams;
      queryEmbedding?: number[];
    };
    if (!corpusId || !query?.trim()) {
      return Response.json({ error: 'corpusId and a non-empty query are required' }, { status: 400 });
    }

    const corpus = loadCorpus(corpusId);
    const { chunkEmbeddings, queryEmbedding: qe } = await resolveEmbeddings(
      corpusId,
      query,
      params,
      queryEmbedding,
    );
    const trace = retrieve({ query, chunks: corpus.chunks, params, chunkEmbeddings, queryEmbedding: qe });
    return Response.json({ trace });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
