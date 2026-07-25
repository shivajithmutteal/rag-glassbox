import { describe, expect, it } from 'vitest';
import { Bm25Index, tokenize } from '../src/index.js';
import type { Chunk } from '../src/index.js';

function mk(index: number, text: string): Chunk {
  return {
    id: `t:${index}`,
    corpusId: 't',
    index,
    text,
    section: '',
    charStart: 0,
    charEnd: text.length,
    tokenCount: tokenize(text).length,
  };
}

const CHUNKS: Chunk[] = [
  mk(0, 'A cricket team has eleven players on each side.'),
  mk(1, 'Leg before wicket, or LBW, is a way a batter can be dismissed.'),
  mk(2, 'A football match is played between two teams of eleven players.'),
];

describe('Bm25Index', () => {
  it('ranks the chunk containing the query term highest', () => {
    const index = new Bm25Index(CHUNKS);
    const scores = index.score('LBW dismissal');
    const best = scores.indexOf(Math.max(...scores));
    expect(best).toBe(1);
    expect(scores[1]).toBeGreaterThan(0);
  });

  it('scores every chunk zero when no query term appears', () => {
    const index = new Bm25Index(CHUNKS);
    const scores = index.score('helicopter avalanche');
    expect(scores).toEqual([0, 0, 0]);
  });

  it('handles an empty corpus without throwing', () => {
    const index = new Bm25Index([]);
    expect(index.score('anything')).toEqual([]);
  });
});
