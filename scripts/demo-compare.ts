/**
 * Keyword vs. semantic, side by side — the whole point of the glass box in one view.
 * Runs the same query both ways over a built corpus and prints the two rankings so
 * you can watch a chunk move (e.g. "what is leg before wicket" ranks the actual LBW
 * chunk low under keyword and #1 under semantic).
 *
 * Usage: tsx scripts/demo-compare.ts [corpusId] [query words...]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from '@huggingface/transformers';
import { retrieve } from '@rag-glassbox/engine';
import type { Corpus, RetrievalTrace } from '@rag-glassbox/engine';

const here = dirname(fileURLToPath(import.meta.url));
const [, , corpusIdArg, ...rest] = process.argv;
const corpusId = corpusIdArg ?? 'cricket';
const query = rest.length ? rest.join(' ') : 'What is leg before wicket?';

const chunksFile = join(here, '..', 'corpus', corpusId, 'chunks.json');
const embedFile = join(here, '..', 'corpus', corpusId, 'embeddings.json');
if (!existsSync(chunksFile)) {
  console.error(`Missing ${chunksFile}. Run \`npm run build:corpus\`.`);
  process.exit(1);
}
if (!existsSync(embedFile)) {
  console.error(`Missing ${embedFile}. Run \`npm run build:embeddings\`.`);
  process.exit(1);
}

const corpus: Corpus = JSON.parse(readFileSync(chunksFile, 'utf8'));
const embed = JSON.parse(readFileSync(embedFile, 'utf8')) as { model: string; vectors: number[][] };

function show(label: string, trace: RetrievalTrace) {
  console.log(`\n${label}`);
  for (const r of trace.results) {
    console.log(`  #${r.rank}  ${r.score.toFixed(3)}   ${r.chunk.section}`);
  }
}

async function main() {
  const extractor = await pipeline('feature-extraction', embed.model);
  const out = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(out.data as Float32Array);

  const keyword = retrieve({ query, chunks: corpus.chunks, params: { mode: 'keyword', topK: 3, nearMissCount: 0 } });
  const semantic = retrieve({
    query,
    chunks: corpus.chunks,
    params: { mode: 'semantic', topK: 3, nearMissCount: 0 },
    chunkEmbeddings: embed.vectors,
    queryEmbedding,
  });

  console.log(`Corpus: ${corpus.title}`);
  console.log(`Query:  "${query}"`);
  show('KEYWORD (BM25):', keyword);
  show('SEMANTIC (embeddings):', semantic);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
