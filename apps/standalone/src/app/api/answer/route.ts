import { RAG_SYSTEM_PROMPT, buildRagPrompt, retrieve } from '@rag-glassbox/engine';
import type { RetrievalParams } from '@rag-glassbox/engine';
import { loadCorpus } from '@/lib/corpora';
import { resolveEmbeddings } from '@/lib/embeddings';
import { getGenerationProvider } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { corpusId, query, params, queryEmbedding } = (await req.json()) as {
    corpusId: string;
    query: string;
    params: RetrievalParams;
    queryEmbedding?: number[];
  };
  const corpus = loadCorpus(corpusId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const { chunkEmbeddings, queryEmbedding: qe } = await resolveEmbeddings(
          corpusId,
          query,
          params,
          queryEmbedding,
        );
        const trace = retrieve({ query, chunks: corpus.chunks, params, chunkEmbeddings, queryEmbedding: qe });
        const prompt = buildRagPrompt(query, trace.results);
        const generationProvider = await getGenerationProvider();
        await generationProvider.generate({
          system: RAG_SYSTEM_PROMPT,
          prompt,
          onToken: (delta) => controller.enqueue(encoder.encode(delta)),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`\n\n[error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
