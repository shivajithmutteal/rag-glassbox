import { Studio } from '@/components/Studio';

export const metadata = {
  title: 'Glass-box RAG',
  description:
    'A glass-box RAG demo that makes the retrieval step visible — keyword (BM25), semantic, and hybrid, with similarity scores and the near-misses just below the cutoff — then streams a grounded, cited answer built from the retrieved sources.',
};

export default function Home() {
  return <Studio />;
}
