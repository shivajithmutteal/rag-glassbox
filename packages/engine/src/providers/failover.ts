import type { GenerateInput, GenerationProvider } from './types';

export interface FailoverOptions {
  /** Ordered generation providers; tried first → last until one succeeds. */
  providers: GenerationProvider[];
  /**
   * Called when a provider fails and we fall through to the next one. Purely for
   * observability (logging which provider was skipped and why). Must not throw.
   */
  onFailover?: (failed: GenerationProvider, error: unknown) => void;
}

/**
 * Wraps an ordered list of generation providers and tries them in turn, so one
 * provider being rate-limited or down doesn't take generation down with it.
 *
 * This is a *reliability* primitive, not a capacity one: each answer still uses
 * exactly one provider — failover just picks the first one that works. (In this
 * app the global rate limit sits far below any single provider's free quota, so
 * failover is insurance against a provider having a bad moment, not a way to sum
 * three free tiers into one big one.)
 *
 * Streaming makes the failover rule subtle. Once a provider has emitted its
 * first token, the client has already rendered partial output, so we cannot
 * silently switch to another provider and restart — the user would see text
 * duplicated or contradicted. The rule is therefore **commit on first token**:
 *
 *   - Provider throws *before* emitting any token → fall through to the next one.
 *     This is the common case: the API rejects the request up front with a 429
 *     (rate limit) or 5xx, before streaming begins.
 *   - Provider throws *after* emitting a token → rethrow. We're committed to that
 *     stream; failing over now would corrupt what the user already sees.
 *
 * Caller-initiated aborts are never retried — they propagate immediately.
 */
export class FailoverGenerationProvider implements GenerationProvider {
  readonly id = 'failover';
  private readonly providers: GenerationProvider[];
  private readonly onFailover?: (failed: GenerationProvider, error: unknown) => void;

  constructor(opts: FailoverOptions) {
    if (opts.providers.length === 0) {
      throw new Error('FailoverGenerationProvider needs at least one provider.');
    }
    this.providers = opts.providers;
    this.onFailover = opts.onFailover;
  }

  /** Nominal model = the preferred (first) provider's model, for display/trace. */
  get model(): string {
    return this.providers[0].model;
  }

  /** The ordered provider ids, e.g. `['groq', 'gemini', 'openrouter']`. */
  get chain(): string[] {
    return this.providers.map((p) => p.id);
  }

  async generate(input: GenerateInput): Promise<string> {
    let lastError: unknown;

    for (const provider of this.providers) {
      // The moment this provider emits a token we're committed to it and can no
      // longer fall through on a later error (see the class comment).
      let committed = false;
      const onToken = input.onToken
        ? (delta: string) => {
            committed = true;
            input.onToken?.(delta);
          }
        : undefined;

      try {
        return await provider.generate({ ...input, onToken });
      } catch (err) {
        lastError = err;
        // Never retry a caller-initiated cancellation / timeout abort.
        if (isAbort(err) || input.signal?.aborted) throw err;
        // Tokens already reached the client — can't switch providers now.
        if (committed) throw err;
        // Clean pre-stream failure: safe to try the next provider.
        this.onFailover?.(provider, err);
      }
    }

    throw lastError ?? new Error('All generation providers failed.');
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}
