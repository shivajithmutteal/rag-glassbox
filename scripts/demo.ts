/**
 * Glass-box retrieval CLI. Runs a query against a built corpus and prints the
 * full retrieval trace — the chunks that made the cut AND the near-misses just
 * below the cutoff, with their scores. Keyword (BM25) mode, so it runs offline
 * with no embedding model or API key.
 *
 * Usage: tsx scripts/demo.ts [corpusId] [query words...]
 *   tsx scripts/demo.ts cricket how many players are on a team
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieve } from '@rag-glassbox/engine';
import type { Corpus, ScoredChunk } from '@rag-glassbox/engine';

const here = dirname(fileURLToPath(import.meta.url));

const [, , corpusIdArg, ...rest] = process.argv;
const corpusId = corpusIdArg ?? 'cricket';
const query = rest.length ? rest.join(' ') : 'How many players are on a cricket team?';

const file = join(here, '..', 'corpus', corpusId, 'chunks.json');
if (!existsSync(file)) {
  console.error(`Missing ${file}. Run \`npm run build:corpus\` first.`);
  process.exit(1);
}

const corpus: Corpus = JSON.parse(readFileSync(file, 'utf8'));

const trace = retrieve({
  query,
  chunks: corpus.chunks,
  params: { mode: 'keyword', topK: 3, nearMissCount: 2 },
});

const oneLine = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const row = (r: ScoredChunk, n: number) => {
  console.log(
    `  #${r.rank}  score ${r.score.toFixed(3)}  bm25 ${(r.keywordScore ?? 0).toFixed(2).padStart(5)}  ${r.chunk.section || '(root)'}`,
  );
  console.log(`      ${oneLine(r.chunk.text, n)}`);
};

console.log(`\nCorpus:  ${corpus.title}  (${corpus.chunks.length} chunks)`);
console.log(`Query:   "${query}"`);
console.log(`\n── Retrieved (made the cut, top ${trace.results.length}) ──`);
trace.results.forEach((r) => row(r, 170));
console.log(`\n── Near misses (the next ${trace.nearMisses.length}, just below the cutoff) ──`);
trace.nearMisses.forEach((r) => row(r, 120));
console.log('');
