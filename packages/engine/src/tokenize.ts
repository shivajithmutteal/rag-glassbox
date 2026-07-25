/**
 * The engine's tokenizer, shared by chunking (token counts) and BM25 (term matching).
 *
 * Deliberately simple and dependency-free: lowercase, then split on any run of
 * non-alphanumeric characters. BM25's IDF term already down-weights ubiquitous
 * words, so no stopword list is needed.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
