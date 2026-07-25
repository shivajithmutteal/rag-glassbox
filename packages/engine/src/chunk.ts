import { tokenize } from './tokenize';
import type { Chunk } from './types';

export interface ChunkOptions {
  /** Approximate target size of a chunk, in tokens. Default 180. */
  targetTokens?: number;
  /**
   * When a single section is split across multiple chunks by size, carry the
   * last block into the next chunk as overlap if > 0. Default 0.
   */
  overlapTokens?: number;
}

interface Block {
  text: string;
  /** Heading path this block sits under, e.g. `"Dismissals > LBW"`. */
  section: string;
  /** Character offsets into the normalized source. */
  start: number;
  end: number;
}

/**
 * Split a markdown document into blocks (paragraphs / list groups), each tagged
 * with the heading path it lives under and its char offsets. Headings and blank
 * lines are block boundaries. Input must be newline-normalized.
 */
function splitBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  const headingStack: { level: number; text: string }[] = [];
  let buf: string[] = [];
  let bufStart = 0;
  let offset = 0;

  const sectionPath = () => headingStack.map((h) => h.text).join(' > ');

  const flush = (end: number) => {
    const text = buf.join('\n').trim();
    if (text) blocks.push({ text, section: sectionPath(), start: bufStart, end });
    buf = [];
  };

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1; // +1 for the '\n' consumed by split

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush(lineStart);
      const level = heading[1]!.length;
      while (headingStack.length && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text: heading[2]!.trim() });
      bufStart = offset;
      continue;
    }

    if (line.trim() === '') {
      flush(lineStart);
      bufStart = offset;
      continue;
    }

    if (buf.length === 0) bufStart = lineStart;
    buf.push(line);
  }

  flush(md.length);
  return blocks;
}

/**
 * Chunk a markdown document for retrieval. Chunks never span a section boundary,
 * so every chunk maps cleanly back to a single heading path (useful for citations
 * and source highlighting); within a section, blocks are packed greedily up to
 * `targetTokens`.
 */
export function chunkCorpus(corpusId: string, markdown: string, opts: ChunkOptions = {}): Chunk[] {
  const target = opts.targetTokens ?? 180;
  const overlap = opts.overlapTokens ?? 0;
  const md = markdown.replace(/\r\n/g, '\n');
  const blocks = splitBlocks(md);

  const chunks: Chunk[] = [];
  let buf: Block[] = [];
  let bufTokens = 0;
  let section = '';

  const blockTokens = (b: Block) => tokenize(b.text).length;

  const emit = () => {
    if (buf.length === 0) return;
    const first = buf[0]!;
    const last = buf[buf.length - 1]!;
    const text = buf.map((b) => b.text).join('\n\n');
    chunks.push({
      id: `${corpusId}:${chunks.length}`,
      corpusId,
      index: chunks.length,
      text,
      section,
      charStart: first.start,
      charEnd: last.end,
      tokenCount: tokenize(text).length,
    });
  };

  for (const block of blocks) {
    const bt = blockTokens(block);
    const sectionChanged = block.section !== section;
    const wouldOverflow = buf.length > 0 && bufTokens + bt > target;

    if (buf.length > 0 && (sectionChanged || wouldOverflow)) {
      emit();
      if (!sectionChanged && overlap > 0) {
        const carry = buf[buf.length - 1]!;
        buf = [carry];
        bufTokens = blockTokens(carry);
      } else {
        buf = [];
        bufTokens = 0;
      }
    }

    if (sectionChanged) section = block.section;
    buf.push(block);
    bufTokens += bt;
  }
  emit();

  return chunks;
}
