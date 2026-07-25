import Anthropic from '@anthropic-ai/sdk';
import type { GenerateInput, GenerationProvider } from '@rag-glassbox/engine';

export interface AnthropicGenerationOptions {
  apiKey?: string;
  model?: string;
}

/**
 * Claude generation via the official Anthropic SDK (streaming). This is the
 * premium override for the local default; it lives in the app tier so the engine
 * stays dependency-free.
 */
export class AnthropicGenerationProvider implements GenerationProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  constructor(opts: AnthropicGenerationOptions = {}) {
    this.model = opts.model ?? 'claude-opus-4-8';
    this.client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  }

  async generate(input: GenerateInput): Promise<string> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: input.maxTokens ?? 1024,
        ...(input.system ? { system: input.system } : {}),
        messages: [{ role: 'user', content: input.prompt }],
      },
      input.signal ? { signal: input.signal } : undefined,
    );

    if (input.onToken) stream.on('text', (delta) => input.onToken?.(delta));

    const final = await stream.finalMessage();
    return final.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }
}
