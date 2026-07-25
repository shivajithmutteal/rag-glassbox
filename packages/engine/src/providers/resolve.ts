import { OllamaEmbeddingProvider, OllamaGenerationProvider } from './ollama';
import { OpenAIEmbeddingProvider, OpenAIGenerationProvider } from './openai';
import { VoyageEmbeddingProvider } from './voyage';
import type { FetchImpl } from './http';
import type { EmbeddingProvider, GenerationProvider } from './types';

export type ProviderEnv = Record<string, string | undefined>;

/**
 * Local-first embedding resolution: use Voyage or OpenAI if a key is present,
 * otherwise fall back to local Ollama (no key required). Anthropic has no
 * embeddings API, so it never appears here.
 */
export function resolveEmbeddingProvider(env: ProviderEnv = {}, fetchImpl?: FetchImpl): EmbeddingProvider {
  if (env.VOYAGE_API_KEY) {
    return new VoyageEmbeddingProvider({ apiKey: env.VOYAGE_API_KEY, model: env.VOYAGE_EMBED_MODEL, fetchImpl });
  }
  if (env.OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_EMBED_MODEL, fetchImpl });
  }
  return new OllamaEmbeddingProvider({ host: env.OLLAMA_HOST, model: env.OLLAMA_EMBED_MODEL, fetchImpl });
}

/**
 * Local-first generation resolution for the zero-dependency providers: use OpenAI
 * if a key is present, otherwise local Ollama. The Anthropic (Claude) provider
 * uses the official SDK and is composed at the app layer, checked ahead of this.
 */
export function resolveGenerationProvider(env: ProviderEnv = {}, fetchImpl?: FetchImpl): GenerationProvider {
  if (env.OPENAI_API_KEY) {
    return new OpenAIGenerationProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_GEN_MODEL, fetchImpl });
  }
  return new OllamaGenerationProvider({ host: env.OLLAMA_HOST, model: env.OLLAMA_GEN_MODEL, fetchImpl });
}
