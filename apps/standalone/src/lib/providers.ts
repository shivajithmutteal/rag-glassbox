import {
  FailoverGenerationProvider,
  OpenAIEmbeddingProvider,
  OpenAIGenerationProvider,
  VoyageEmbeddingProvider,
  resolveGenerationProvider,
  type EmbeddingProvider,
  type GenerationProvider,
} from '@rag-glassbox/engine';

// OpenAI-compatible endpoints for the free-tier providers. All three speak the
// same /chat/completions streaming shape, so the engine's OpenAIGenerationProvider
// drives all of them — only the base URL, key, and model differ.
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Defaults verified current as of 2026-07; all overridable via env because free
// tiers rename/retire models often. If a default 404s, set the matching *_MODEL var.
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

/**
 * Resolve the generation provider, in priority order:
 *
 *   1. Claude override — if `ANTHROPIC_API_KEY` is set, use Claude alone (the
 *      local "premium" path; SDK imported lazily so it never loads otherwise).
 *   2. Free-tier failover chain — any subset of Groq → Gemini → OpenRouter that
 *      has a key, wrapped so a rate-limited/down provider falls through to the
 *      next. This is the hosted demo's path.
 *   3. Local-first fallback — OpenAI if keyed, else local Ollama (zero-key dev).
 *
 * The chain preserves order: Groq is preferred (fastest, and where the safety
 * check runs), Gemini second, OpenRouter last.
 */
export async function getGenerationProvider(): Promise<GenerationProvider> {
  const env = process.env;

  // 1) Explicit Claude override — single provider, no failover.
  if (env.ANTHROPIC_API_KEY) {
    const { AnthropicGenerationProvider } = await import('./anthropic');
    return new AnthropicGenerationProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  }

  // 2) Free-tier failover chain.
  const chain: GenerationProvider[] = [];
  if (env.GROQ_API_KEY) {
    chain.push(
      new OpenAIGenerationProvider({
        id: 'groq',
        apiKey: env.GROQ_API_KEY,
        baseUrl: GROQ_BASE,
        model: env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
      }),
    );
  }
  if (env.GEMINI_API_KEY) {
    chain.push(
      new OpenAIGenerationProvider({
        id: 'gemini',
        apiKey: env.GEMINI_API_KEY,
        baseUrl: GEMINI_BASE,
        model: env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
      }),
    );
  }
  if (env.OPENROUTER_API_KEY) {
    chain.push(
      new OpenAIGenerationProvider({
        id: 'openrouter',
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: OPENROUTER_BASE,
        model: env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      }),
    );
  }
  if (chain.length > 0) {
    return new FailoverGenerationProvider({
      providers: chain,
      onFailover: (failed, error) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[generation] provider "${failed.id}" failed; failing over. ${reason}`);
      },
    });
  }

  // 3) Local-first zero-key fallback (OpenAI if keyed, else Ollama).
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
