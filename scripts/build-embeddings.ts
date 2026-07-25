/**
 * Precompute semantic embeddings for every built corpus, using a small in-process
 * model (transformers.js) — no API key, no server. Writes corpus/<id>/embeddings.json
 * (vectors aligned 1:1 with chunks). The hosted demo ships these committed, and
 * embeds the query with the *same* model client-side so the vectors share a space.
 *
 * Usage: npm run build:embeddings   (run `npm run build:corpus` first)
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from '@huggingface/transformers';
import type { Corpus } from '@rag-glassbox/engine';

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', 'corpus');

async function main() {
  const ids = readdirSync(corpusDir).filter(
    (id) => statSync(join(corpusDir, id)).isDirectory() && existsSync(join(corpusDir, id, 'chunks.json')),
  );
  if (ids.length === 0) {
    console.warn('No corpus/<id>/chunks.json found. Run `npm run build:corpus` first.');
    return;
  }

  console.log(`Loading embedding model ${EMBED_MODEL} …`);
  const extractor = await pipeline('feature-extraction', EMBED_MODEL);

  for (const id of ids) {
    const corpus: Corpus = JSON.parse(readFileSync(join(corpusDir, id, 'chunks.json'), 'utf8'));
    const vectors: number[][] = [];
    for (const chunk of corpus.chunks) {
      const out = await extractor(chunk.text, { pooling: 'mean', normalize: true });
      vectors.push(Array.from(out.data as Float32Array));
    }
    const dims = vectors[0]?.length ?? 0;
    writeFileSync(
      join(corpusDir, id, 'embeddings.json'),
      JSON.stringify({ model: EMBED_MODEL, dims, vectors }),
    );
    console.log(`${id.padEnd(10)} ${String(vectors.length).padStart(3)} vectors x ${dims} dims  -> corpus/${id}/embeddings.json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
