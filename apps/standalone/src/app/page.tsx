import { listCorpora, loadCorpus } from '@/lib/corpora';
import { Studio } from '@/components/Studio';

export const dynamic = 'force-dynamic';

export default function Home() {
  const corpora = listCorpora();
  if (corpora.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-8 text-sm text-slate-600 dark:text-slate-300">
        No corpora built yet. Run{' '}
        <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">npm run build:corpus</code> at the
        repo root, then reload.
      </main>
    );
  }
  const first = loadCorpus(corpora[0].id);
  return (
    <Studio
      corpora={corpora}
      initial={{ id: first.id, title: first.title, source: first.source }}
    />
  );
}
