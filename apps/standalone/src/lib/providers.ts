import {
  OpenAIEmbeddingProvider,
  VoyageEmbeddingProvider,
  resolveGenerationProvider,
  type EmbeddingProvider,
  type GenerationProvider,
} from '@rag-glassbox/engine';

/**
 * Local-first generation resolution, extended with the Claude override: use Claude
 * if `ANTHROPIC_API_KEY` is set, otherwise fall back to the engine's zero-dependency
 * resolution (OpenAI if keyed, else local Ollama). The Claude adapter is imported
 * lazily so local-only runs never load the SDK.
 */
export async function getGenerationProvider(): Promise<GenerationProvider> {
  const env = process.env;
  if (env.ANTHROPIC_API_KEY) {
    const { AnthropicGenerationProvider } = await import('./anthropic');
    return new AnthropicGenerationProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  }
  return resolveGenerationProvider(env);
}

/**
 * Server-side embedding provider for semantic search — only the hosted, keyed
 * providers run on the server. With no key (the local default), chunk vectors come
 * from the committed precompute and the query is embedded in the browser, so no
 * model ever runs in the Node server. Returns null in that local case.
 */
export function getServerEmbeddingProvider(): EmbeddingProvider | null {
  const env = process.env;
  if (env.VOYAGE_API_KEY) {
    return new VoyageEmbeddingProvider({ apiKey: env.VOYAGE_API_KEY, model: env.VOYAGE_EMBED_MODEL });
  }
  if (env.OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_EMBED_MODEL });
  }
  return null;
}
