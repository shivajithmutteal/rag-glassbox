import { describe, expect, it, vi } from 'vitest';
import { FailoverGenerationProvider } from '../src/index.js';
import type { GenerateInput, GenerationProvider } from '../src/index.js';

/** A scriptable fake provider: either streams the given tokens then resolves, or throws. */
function fakeProvider(
  id: string,
  behavior: { tokens?: string[]; throwBefore?: Error; throwAfter?: Error },
): GenerationProvider {
  return {
    id,
    model: `${id}-model`,
    async generate(input: GenerateInput): Promise<string> {
      if (behavior.throwBefore) throw behavior.throwBefore;
      let text = '';
      for (const t of behavior.tokens ?? []) {
        text += t;
        input.onToken?.(t);
      }
      if (behavior.throwAfter) throw behavior.throwAfter;
      return text;
    },
  };
}

describe('FailoverGenerationProvider', () => {
  it('returns the first provider result when it succeeds (no failover)', async () => {
    const second = vi.fn();
    const provider = new FailoverGenerationProvider({
      providers: [
        fakeProvider('a', { tokens: ['He', 'llo'] }),
        { id: 'b', model: 'b', generate: second as unknown as GenerationProvider['generate'] },
      ],
    });
    const tokens: string[] = [];
    const text = await provider.generate({ prompt: 'hi', onToken: (d) => tokens.push(d) });
    expect(text).toBe('Hello');
    expect(tokens).toEqual(['He', 'llo']);
    expect(second).not.toHaveBeenCalled();
  });

  it('falls through to the next provider when the first throws before any token', async () => {
    const onFailover = vi.fn();
    const provider = new FailoverGenerationProvider({
      providers: [
        fakeProvider('a', { throwBefore: new Error('429 rate limited') }),
        fakeProvider('b', { tokens: ['ok'] }),
      ],
      onFailover,
    });
    expect(await provider.generate({ prompt: 'hi' })).toBe('ok');
    expect(onFailover).toHaveBeenCalledOnce();
    expect(onFailover.mock.calls[0][0].id).toBe('a');
  });

  it('rethrows (does NOT fail over) when a provider throws after emitting a token', async () => {
    const provider = new FailoverGenerationProvider({
      providers: [
        fakeProvider('a', { tokens: ['par'], throwAfter: new Error('mid-stream boom') }),
        fakeProvider('b', { tokens: ['should-not-run'] }),
      ],
    });
    const tokens: string[] = [];
    await expect(provider.generate({ prompt: 'hi', onToken: (d) => tokens.push(d) })).rejects.toThrow(
      /mid-stream boom/,
    );
    // The committed partial token was surfaced; provider b never ran.
    expect(tokens).toEqual(['par']);
  });

  it('throws the last error when every provider fails', async () => {
    const provider = new FailoverGenerationProvider({
      providers: [
        fakeProvider('a', { throwBefore: new Error('a down') }),
        fakeProvider('b', { throwBefore: new Error('b down') }),
      ],
    });
    await expect(provider.generate({ prompt: 'hi' })).rejects.toThrow(/b down/);
  });

  it('does not retry on an abort', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const secondRan = vi.fn();
    const provider = new FailoverGenerationProvider({
      providers: [
        fakeProvider('a', { throwBefore: abort }),
        { id: 'b', model: 'b', generate: secondRan as unknown as GenerationProvider['generate'] },
      ],
    });
    await expect(provider.generate({ prompt: 'hi' })).rejects.toThrow(/aborted/);
    expect(secondRan).not.toHaveBeenCalled();
  });

  it('requires at least one provider', () => {
    expect(() => new FailoverGenerationProvider({ providers: [] })).toThrow(/at least one/);
  });

  it('exposes the provider chain and nominal model', () => {
    const provider = new FailoverGenerationProvider({
      providers: [fakeProvider('groq', {}), fakeProvider('gemini', {})],
    });
    expect(provider.chain).toEqual(['groq', 'gemini']);
    expect(provider.model).toBe('groq-model');
  });
});
