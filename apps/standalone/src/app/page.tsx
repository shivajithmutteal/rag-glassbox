import { Studio } from '@/components/Studio';

export const metadata = {
  title: 'Glass-box RAG',
  description:
    'A retrieval-augmented-generation demo that makes the retrieval step visible — keyword, semantic, and hybrid, with similarity scores and the near-misses just below the cutoff. Runs entirely in the browser.',
};

export default function Home() {
  return <Studio />;
}
