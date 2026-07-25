import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting for /api/answer, backed by Upstash Redis.
 *
 * Why Redis at all: Vercel runs this route as stateless, ephemeral serverless
 * workers — a counter in a module variable resets on every cold start and isn't
 * shared across the parallel workers a burst spins up. So the counters have to
 * live in one external store every worker talks to. Upstash is HTTP-based Redis,
 * which is what makes it reachable from a short-lived serverless function.
 * (See research-advance/internet-web/web-servers for the serverless write-up.)
 *
 * Two axes, four windows:
 *   - per-IP  (5/hour, 50/day)   → stops one visitor hammering the demo.
 *   - global  (60/hour, 300/day) → the real wallet/quota protector; a circuit
 *     breaker across *everyone*, since per-IP limits are trivially bypassed with
 *     a VPN. 300/day split across the 3-provider failover chain is ~100 each,
 *     far under any single free tier.
 *
 * If Upstash isn't configured (no URL/token — e.g. local dev), limiting is
 * skipped rather than failing the request. All four limits are env-tunable.
 */

export interface RateLimitConfig {
  ipHour: number;
  ipDay: number;
  globalHour: number;
  globalDay: number;
}

export type RateLimitVerdict =
  | { ok: true }
  | { ok: false; scope: 'ip' | 'global'; window: 'hour' | 'day'; reason: string; retryAfterSec: number };

function intFromEnv(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function defaultRateLimitConfig(env: Record<string, string | undefined> = process.env): RateLimitConfig {
  return {
    ipHour: intFromEnv(env.RL_IP_HOUR, 5),
    ipDay: intFromEnv(env.RL_IP_DAY, 50),
    globalHour: intFromEnv(env.RL_GLOBAL_HOUR, 60),
    globalDay: intFromEnv(env.RL_GLOBAL_DAY, 300),
  };
}

// --- lazy singletons (built once per warm worker) ---
interface Limiters {
  ipHour: Ratelimit;
  ipDay: Ratelimit;
  globalHour: Ratelimit;
  globalDay: Ratelimit;
}
let cached: Limiters | null = null;

function getLimiters(config: RateLimitConfig): Limiters | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // no store configured → limiting disabled

  const redis = new Redis({ url, token });
  // A shared in-memory cache lets an already-blocked identifier short-circuit
  // without a Redis round-trip while the worker stays warm.
  const ephemeralCache = new Map<string, number>();
  const make = (max: number, window: `${number} ${'h' | 'd'}`, prefix: string) =>
    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, window), prefix, ephemeralCache, analytics: false });

  cached = {
    ipHour: make(config.ipHour, '1 h', 'rl:ip:h'),
    ipDay: make(config.ipDay, '1 d', 'rl:ip:d'),
    globalHour: make(config.globalHour, '1 h', 'rl:global:h'),
    globalDay: make(config.globalDay, '1 d', 'rl:global:d'),
  };
  return cached;
}

function retryAfterSec(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

/**
 * Check all limiters for this request. Order: per-IP first (cheaper to reject an
 * abuser, and avoids consuming a global token on an IP-blocked request), then the
 * global circuit breaker. Returns the first limit that trips, or `{ ok: true }`.
 */
export async function checkRateLimits(ip: string, config: RateLimitConfig): Promise<RateLimitVerdict> {
  const limiters = getLimiters(config);
  if (!limiters) return { ok: true }; // Upstash not configured → don't block

  const ipHour = await limiters.ipHour.limit(ip);
  if (!ipHour.success)
    return { ok: false, scope: 'ip', window: 'hour', reason: 'Hourly limit reached for your connection.', retryAfterSec: retryAfterSec(ipHour.reset) };

  const ipDay = await limiters.ipDay.limit(ip);
  if (!ipDay.success)
    return { ok: false, scope: 'ip', window: 'day', reason: 'Daily limit reached for your connection.', retryAfterSec: retryAfterSec(ipDay.reset) };

  const globalHour = await limiters.globalHour.limit('global');
  if (!globalHour.success)
    return { ok: false, scope: 'global', window: 'hour', reason: 'The demo is busy right now (hourly cap). Try again soon.', retryAfterSec: retryAfterSec(globalHour.reset) };

  const globalDay = await limiters.globalDay.limit('global');
  if (!globalDay.success)
    return { ok: false, scope: 'global', window: 'day', reason: "The demo hit its daily cap. Please try again tomorrow, or run it locally.", retryAfterSec: retryAfterSec(globalDay.reset) };

  return { ok: true };
}
