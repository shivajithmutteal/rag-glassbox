import { loadCorpus } from '@/lib/corpora';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
  try {
    const corpus = loadCorpus(id);
    return Response.json({ id: corpus.id, title: corpus.title, source: corpus.source });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
