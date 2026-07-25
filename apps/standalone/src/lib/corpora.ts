import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Corpus } from '@rag-glassbox/engine';

/** The committed corpus data lives at the monorepo root: <repo>/corpus/<id>/chunks.json. */
function corpusDir(): string {
  return resolve(process.cwd(), '..', '..', 'corpus');
}

const cache = new Map<string, Corpus>();

export function loadCorpus(id: string): Corpus {
  const cached = cache.get(id);
  if (cached) return cached;
  const file = join(corpusDir(), id, 'chunks.json');
  if (!existsSync(file)) throw new Error(`Unknown corpus "${id}". Run \`npm run build:corpus\`.`);
  const corpus = JSON.parse(readFileSync(file, 'utf8')) as Corpus;
  cache.set(id, corpus);
  return corpus;
}

export function listCorpora(): { id: string; title: string }[] {
  const dir = corpusDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => existsSync(join(dir, id, 'chunks.json')))
    .map((id) => ({ id, title: loadCorpus(id).title }));
}
