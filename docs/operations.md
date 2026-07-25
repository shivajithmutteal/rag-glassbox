# Operations Runbook — rag-glassbox generation

Operational notes for the live generation pipeline on `rag.mutteal.com`. For the
*why* behind the design, see [generation-pipeline.md](./generation-pipeline.md).

---

## Cost model — it's $0

Everything runs on free tiers, and there is no credit card on any of them, so the
services **cannot** bill you — they rate-limit instead of charging.

| Service | Free allowance | Our worst-case usage |
|---------|----------------|----------------------|
| Groq | Generous free tier, no card | Primary provider + safety check |
| Google Gemini | Free tier | Failover only |
| OpenRouter | ~50 req/day (`:free` models) | Last-resort failover; key capped at $1 |
| Upstash Redis | 500K commands/month, no card | ~90K/mo at the 300/day answer cap |

The OpenRouter key also has a **$1 credit limit** set on it as belt-and-suspenders
(free models spend $0, so it never triggers).

---

## Rate limits

Enforced in `apps/standalone/src/lib/ratelimit.ts` (Upstash Redis). Current values:

| Scope | Hour | Day | Purpose |
|-------|------|-----|---------|
| Per-IP | **10** | **50** | Stop one visitor hammering the demo |
| Global | **60** | **300** | Circuit breaker across everyone (the real protector) |

**To change:** set env vars in Vercel — no code change, no redeploy of code needed
(just a redeploy to pick up the env change): `RL_IP_HOUR`, `RL_IP_DAY`,
`RL_GLOBAL_HOUR`, `RL_GLOBAL_DAY`. Code defaults live in `ratelimit.ts`.

**What a visitor sees when limited:** the request returns **HTTP 429**, and the
page **falls back to retrieval-only** — the retrieval trace stays on screen and the
Answer panel shows a soft "Generation paused" notice with a "run locally" link. No
error banner; the demo stays usable. (Guardrail 400s, by contrast, *do* show the
error banner — those are input problems, not capacity.)

**If Upstash is unconfigured** (no URL/token), rate limiting is silently skipped.

---

## Providers & failover

Chain order (in `apps/standalone/src/lib/providers.ts`): **Groq → Gemini →
OpenRouter**. Only providers with a key present are included.

- A provider that fails **before its first token** (429, **404 unknown model**,
  5xx, network) is skipped and the next one takes over — transparently.
- A provider that fails **mid-stream** (after tokens started) is not retried; the
  partial answer stands and an inline `[error]` is appended.
- If **all** providers fail, the Answer panel shows an inline `[error: …]`.

Failover events are logged to the Vercel function logs (`[generation] provider
"groq" failed; failing over. …`).

### Model IDs (free tiers rename/retire these — re-check if a call 404s)

Defaults (current as of 2026-07), all env-overridable:

| Provider | Env var | Default |
|----------|---------|---------|
| Groq | `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| Gemini | `GEMINI_MODEL` | `gemini-2.5-flash` |
| OpenRouter | `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` |

A stale ID doesn't break the demo — a 404 just fails over to the next provider.
But fix it: set the matching `*_MODEL` env var in Vercel to a current model and
redeploy. Provider model lists: Groq `console.groq.com/docs/models`, Gemini
`aistudio.google.com`, OpenRouter `openrouter.ai/models?max_price=0`.

---

## Safety check

`apps/standalone/src/lib/groq-safety.ts`. Runs **only when `GROQ_API_KEY` is set**,
classifying the query ALLOW/BLOCK before generation.

- Default model: `llama-3.1-8b-instant` (fast, cheap). Meta's Llama Guard was
  removed from Groq on 2026-03-05.
- **Swapping models does NOT need an OpenAI key.** Set `GROQ_GUARD_MODEL` to e.g.
  `openai/gpt-oss-safeguard-20b` — despite the `openai/` prefix it's an open-weight
  model **hosted on Groq**, called with your existing `GROQ_API_KEY`.
- **Fail-open** by default: if the safety call itself errors, the request is
  allowed (and logged). Set `GROQ_GUARD_FAIL_CLOSED=true` to reject instead.

---

## Guardrail

`apps/standalone/src/lib/guardrail.ts`, always on, before rate-limiting.

- Length cap: `MAX_QUERY_CHARS` (default 500) → HTTP 400.
- PII: email / US phone / Luhn-valid card / SSN are **redacted** (not blocked).
- Blocklist: injection markers → HTTP 400. Extend with `GUARDRAIL_BLOCKLIST`
  (comma-separated), merged with the built-in list.

---

## Environment variables

Set in **Vercel → Settings → Environment Variables** (Production) and
`apps/standalone/.env.local` for local dev. Full annotated list in `.env.example`.

- **Never** commit real values (they're gitignored) and **never** prefix a secret
  with `NEXT_PUBLIC_` — that inlines it into the browser bundle.
- `NEXT_PUBLIC_ENABLE_GENERATION=true` is the only intentionally-public one (a UI
  flag). Changing any `NEXT_PUBLIC_*` var requires a **rebuild** (redeploy), not
  just a restart.

---

## Monitoring

- **Vercel → your project → Logs** (or a deployment's Functions tab): `/api/answer`
  runtime logs — failover warnings, safety-check fail-open warnings, errors.
- **Upstash console → your DB → Data Browser / Metrics**: rate-limit keys
  (`rl:ip:*`, `rl:global:*`) and command counts vs the 500K/mo free allowance.
- **Provider dashboards**: Groq / Gemini / OpenRouter each show request counts and
  remaining free quota.

---

## Common issues & fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Answer panel shows `[error: …]` | All providers failed | Check Vercel logs; likely all model IDs stale or all keys missing/invalid — set current `*_MODEL` / re-check keys |
| Every answer 404s one provider | That provider's model ID retired | Set its `*_MODEL` env var to a current model, redeploy |
| "Generation paused" notice always | Global cap hit, or per-IP hit | Wait for reset, or raise `RL_*`; check Upstash metrics |
| 500 on `/api/answer` | Upstash creds wrong (limiter throws) | Verify `UPSTASH_REDIS_REST_URL/TOKEN`; unset both to disable limiting |
| Generation does nothing after deploy | New code not deployed, or `NEXT_PUBLIC_ENABLE_GENERATION` not `true` | Confirm the commit is on `main` and redeploy; verify the flag |
| Safety check blocking valid questions | Guard model too strict | Adjust `GROQ_GUARD_MODEL`, or (temporarily) unset `GROQ_API_KEY`'s guard by tuning the prompt in `groq-safety.ts` |

---

## Local testing

```bash
# apps/standalone/.env.local  (gitignored)
NEXT_PUBLIC_ENABLE_GENERATION=true
GROQ_API_KEY=gsk_...           # one key is enough; add others to test failover
# UPSTASH_* optional locally (limiting skips if unset)

npm run dev --workspace @rag-glassbox/standalone   # restart after editing .env.local
npm test                                           # engine failover + guardrail units
```

Smoke-test the endpoint directly:
```bash
curl -N -X POST http://localhost:3000/api/answer -H 'content-type: application/json' \
  -d '{"corpusId":"cricket","query":"How many players are on a team?","params":{"mode":"keyword","topK":3,"nearMissCount":2,"semanticWeight":0.5}}'
```
