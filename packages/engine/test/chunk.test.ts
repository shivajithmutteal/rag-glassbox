import { describe, expect, it } from 'vitest';
import { chunkCorpus } from '../src/index.js';

const DOC = `# Cricket

Intro paragraph about the game.

## Dismissals

There are several ways to be out.

### LBW

Leg before wicket is a method of dismissal.

## Extras

A wide is a delivery too far from the batter.
`;

describe('chunkCorpus', () => {
  it('produces chunks that each stay within a single section', () => {
    const chunks = chunkCorpus('cricket', DOC);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk carries a heading path, and no chunk mixes two sections.
    const sections = new Set(chunks.map((c) => c.section));
    expect(sections.has('Cricket')).toBe(true);
    expect(sections.has('Cricket > Dismissals')).toBe(true);
    expect(sections.has('Cricket > Dismissals > LBW')).toBe(true);
    expect(sections.has('Cricket > Extras')).toBe(true);
  });

  it('assigns sequential ids and indices', () => {
    const chunks = chunkCorpus('cricket', DOC);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.id).toBe(`cricket:${i}`);
      expect(c.tokenCount).toBeGreaterThan(0);
    });
  });

  it('normalizes CRLF and keeps char offsets in range', () => {
    const chunks = chunkCorpus('cricket', DOC.replace(/\n/g, '\r\n'));
    const normalizedLen = DOC.length;
    for (const c of chunks) {
      expect(c.charStart).toBeGreaterThanOrEqual(0);
      expect(c.charEnd).toBeLessThanOrEqual(normalizedLen);
      expect(c.charEnd).toBeGreaterThan(c.charStart);
    }
  });
});
