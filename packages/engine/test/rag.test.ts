import { describe, expect, it, vi } from 'vitest';
import { answerQuestion, buildRagPrompt, chunkCorpus } from '../src/index.js';
import type { Corpus, EmbeddingProvider, GenerateInput, GenerationProvider } from '../src/index.js';

const SOURCE = `# Doc

## Apples
Apples are red fruit.

## Bananas
Bananas are yellow fruit.
`;

function makeCorpus(): Corpus {
  const chunks = chunkCorpus('doc', SOURCE);
  return { id: 'doc', title: 'Doc', source: SOURCE, chunks };
}

class RecordingGen implements GenerationProvider {
  readonly id = 'fake';
  readonly model = 'fake';
  lastPrompt = '';
  lastSystem: string | undefined;
  async generate(input: GenerateInput): Promise<string> {
    this.lastPrompt = input.prompt;
    this.lastSystem = input.system;
    input.onToken?.('ok');
    return 'answer [1]';
  }
}

describe('buildRagPrompt', () => {
  it('numbers sources and includes the question', () => {
    const { chunks } = makeCorpus();
    const scored = chunks.map((chunk, i) => ({ chunk, score: 1 - i * 0.1, rank: i + 1 }));
    const prompt = buildRagPrompt('what colour are bananas', scored);
    expect(prompt).toContain('Question: what colour are bananas');
    expect(prompt).toContain('[1]');
    expect(prompt).toContain('Bananas are yellow fruit.');
  });
});

describe('answerQuestion', () => {
  it('keyword mode never calls the embedding provider', async () => {
    const gen = new RecordingGen();
    const embed = vi.fn(async () => [] as number[][]);
    const provider: EmbeddingProvider = { id: 'e', model: 'e', embed };
    const res = await answerQuestion({
      query: 'red fruit',
      corpus: makeCorpus(),
      params: { mode: 'keyword', topK: 1 },
      generationProvider: gen,
      embeddingProvider: provider,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(res.answer).toBe('answer [1]');
    expect(res.trace.results).toHaveLength(1);
    expect(res.prompt).toContain('Sources:');
    expect(gen.lastSystem).toContain('ONLY the numbered sources');
  });

  it('semantic mode embeds chunks and query, then ranks by similarity', async () => {
    const gen = new RecordingGen();
    // 1-D toy embedding: "does the text mention bananas?"
    const embed = vi.fn(async (texts: string[]) =>
      texts.map((t) => [t.toLowerCase().includes('banana') ? 1 : 0]),
    );
    const provider: EmbeddingProvider = { id: 'e', model: 'e', embed };
    const res = await answerQuestion({
      query: 'banana',
      corpus: makeCorpus(),
      params: { mode: 'semantic', topK: 1 },
      generationProvider: gen,
      embeddingProvider: provider,
    });
    expect(embed.mock.calls.length).toBeGreaterThanOrEqual(2); // chunks + query
    expect(res.trace.results[0]!.chunk.text.toLowerCase()).toContain('banana');
  });

  it('semantic mode without an embedding provider throws', async () => {
    const gen = new RecordingGen();
    await expect(
      answerQuestion({
        query: 'q',
        corpus: makeCorpus(),
        params: { mode: 'semantic', topK: 1 },
        generationProvider: gen,
      }),
    ).rejects.toThrow(/embeddingProvider/);
  });
});
