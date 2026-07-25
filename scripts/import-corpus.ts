/**
 * Import raw corpus markdown produced by the generation workflow into the repo.
 *
 * Usage: tsx scripts/import-corpus.ts <workflow-output.json>
 *
 * The input is a JSON array of { name, title, markdown }. We strip any commentary
 * a fact-checking pass may have left before the document's H1, then write each to
 * corpus/<name>/source.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', 'corpus');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: tsx scripts/import-corpus.ts <workflow-output.json>');
  process.exit(1);
}

interface CorpusDoc {
  name: string;
  title: string;
  markdown: string;
}

/** Drop anything before the first level-1 ATX heading (`# Title`). */
function stripPreamble(md: string): string {
  const normalized = md.replace(/\r\n/g, '\n');
  const h1 = /^# [^\n#].*$/m.exec(normalized);
  const body = h1 ? normalized.slice(h1.index) : normalized;
  return body.trim() + '\n';
}

const parsed: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
// The workflow returns a bare array; the task-output file wraps it under `result`.
const docs: CorpusDoc[] = Array.isArray(parsed)
  ? (parsed as CorpusDoc[])
  : ((parsed as { result: CorpusDoc[] }).result ?? []);
if (docs.length === 0) {
  console.error('No corpus documents found in input.');
  process.exit(1);
}

for (const { name, markdown } of docs) {
  const dir = join(corpusDir, name);
  mkdirSync(dir, { recursive: true });
  const cleaned = stripPreamble(markdown);
  writeFileSync(join(dir, 'source.md'), cleaned, 'utf8');
  console.log(`${name}: ${cleaned.length} chars -> corpus/${name}/source.md`);
}
