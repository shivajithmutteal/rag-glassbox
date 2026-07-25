/**
 * Chunk every corpus/<name>/source.md into a retrieval-ready corpus/<name>/chunks.json.
 *
 * The output is a serialized {@link Corpus}: id, title, normalized source, and the
 * chunk list. This is what the app (and the CLI demo) load — no vector DB, just a
 * committed JSON file per corpus.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkCorpus } from '@rag-glassbox/engine';
import type { Corpus } from '@rag-glassbox/engine';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', 'corpus');

function titleOf(md: string, fallback: string): string {
  const m = /^# (.+)$/m.exec(md);
  return m ? m[1]!.trim() : fallback;
}

if (!existsSync(corpusDir)) {
  console.error(`No corpus directory at ${corpusDir}`);
  process.exit(1);
}

const ids = readdirSync(corpusDir).filter(
  (name) =>
    statSync(join(corpusDir, name)).isDirectory() &&
    existsSync(join(corpusDir, name, 'source.md')),
);

if (ids.length === 0) {
  console.warn('No corpus/<name>/source.md files found. Run `npm run import:corpus` first.');
  process.exit(0);
}

for (const id of ids) {
  const source = readFileSync(join(corpusDir, id, 'source.md'), 'utf8').replace(/\r\n/g, '\n');
  const chunks = chunkCorpus(id, source);
  const corpus: Corpus = { id, title: titleOf(source, id), source, chunks };
  const out = join(corpusDir, id, 'chunks.json');
  writeFileSync(out, JSON.stringify(corpus, null, 2), 'utf8');
  console.log(`${id.padEnd(10)} ${String(chunks.length).padStart(3)} chunks  ${source.length} chars  -> corpus/${id}/chunks.json`);
}
