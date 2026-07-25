# rag-glassbox — build progress & highlights

A living log of what's built, why, and what's proven.

## What this is

**Glass-box RAG** — a retrieval-augmented-generation demo whose whole point is making the *retrieval* step visible (ranked chunks, scores, near-misses, the cutoff), not just the final answer. Most RAG demos are black boxes; this one shows the part everyone hides — including where it goes wrong.

## Highlights — what the glass box actually reveals

The honest, verified finding is more interesting than "semantic beats keyword." Retrieval quality is **fragile and query-dependent**, and the glass box lets you watch it:

- **The bare query "what is leg before wicket" trips up *both* retrievers.** Keyword (BM25) matches the words "wicket"/"leg" and surfaces **Run Out #1, Leg-Bye #3**, with the real LBW chunk at #2. Semantic (MiniLM) gets so distracted by the *concept* "wicket" that it ranks Stumps, Hit Wicket, and Bowled higher and buries the real LBW chunk at **rank 9**. Two different retrievers, same blind spot — visible side by side.
- **Rephrasing rescues it, and you can watch.** A paraphrase with no lexical overlap — *"the ball hits the batter on the pad and would have gone on to hit the stumps"* — puts LBW **#1 and #2** under semantic (and #1 under keyword, because the paraphrase happens to share content words). Adding the acronym ("how is a batter out lbw") also recovers it. The lesson the demo teaches: *query phrasing and vocabulary overlap matter enormously, and hybrid often balances the two.*
- **Honest fail mode.** *"who won the 2019 world cup final"* (unanswerable from the corpus) visibly flails — retrieval being wrong is *shown*, not hidden.
- **The fact-checker caught a real error.** The cricket corpus draft said the "timed out" interval is 3 minutes; the adversarial fact-check pass corrected it to 2 minutes (ICC playing conditions).

> ⚠️ Earlier in the build I predicted "semantic snaps LBW to #1" on the bare query. Empirically that's false with this model — corrected above. The whole point of the glass box is to surface exactly this kind of surprise.

## Architecture

- **Monorepo**, npm workspaces (no pnpm needed → `git clone && npm install`).
- **`packages/engine`** — pure, **zero runtime dependencies**. Heading-aware chunker, BM25 keyword retrieval, vector math, the `retrieve()` glass-box trace, model-agnostic provider seams, and the RAG pipeline (`answerQuestion`). BM25 is the tested-offline path; semantic is pluggable.
- **`packages/ui`** — presentational React components: corpus panel (highlighted sources), answer panel, retrieval-trace panel (score bars + cutoff + near-misses), mode controls, composed `GlassBox`.
- **`apps/standalone`** — thin Next 16 app (App Router, Turbopack) wiring engine + UI, with `/api/retrieve`, `/api/corpus`, `/api/answer` routes.
- **`corpus/<name>/`** — `source.md` + `chunks.json` + `embeddings.json` for cricket, football, Morse.
- **`scripts/`** — `import:corpus`, `build:corpus`, `build:embeddings`, `demo`, `demo:compare`.

## Key decisions

- **Keyword retrieval is offline and zero-dependency** (BM25) — clone-and-run, no model, no key. Semantic sits behind a pluggable `EmbeddingProvider`.
- **Local-first, override by config.** Generation: local Ollama by default; override via `ANTHROPIC_API_KEY` (Claude, official SDK, streaming) → `OPENAI_API_KEY` → Ollama. Embeddings: `VOYAGE_API_KEY` / `OPENAI_API_KEY` if set, else a local model.
- **Semantic runs no model in the Node server.** Corpus embeddings are **precomputed at build time** (transformers.js, `all-MiniLM-L6-v2`) and committed as `embeddings.json`; the **query is embedded in the browser** with the same model (or by a hosted key). This avoids native-module-in-Next crashes and is exactly the hosted-demo shape.
- **The Claude adapter uses the official `@anthropic-ai/sdk`** and lives in the app tier, keeping the engine dependency-free.
- **Hosted demo (mutteal.com) = retrieval-only**: precomputed corpus + client-side query embedding → zero server-side AI calls, nothing to bill or abuse; free-text shows the live trace + a "run the repo" CTA. The **standalone repo** is the full generate loop.

## Tier status — all built & verified

| Tier | Status | Verification |
|---|---|---|
| 0 · Recon + API facts | ✅ | Node 24 / npm workspaces; pinned `claude-opus-4-8`, no first-party embeddings |
| 1 · Engine core | ✅ | chunker, BM25, vectors, retrieval trace |
| 2 · Corpora (workflow) | ✅ | cricket 42 / football 34 / Morse 21 chunks, fact-checked |
| 3 · Corpus tooling + CLI demo | ✅ | offline BM25 cricket retrieval |
| 4 · Providers + semantic + RAG pipeline | ✅ | Ollama/OpenAI/Voyage adapters, `answerQuestion` |
| 5 · Glass-box UI package | ✅ | three-panel components + helpers |
| 6 · Standalone Next 16 app | ✅ | `next build` green; keyword retrieval verified over HTTP |
| 7 · Semantic path + comparison | ✅ | precomputed embeddings; semantic verified over HTTP (query vector → LBW #1/#2); browser query-embedding wired + client bundle builds |

**Tests: 24 passing** (`chunk`, `bm25`, `retrieve`, `providers` mocked-fetch, `rag` fake-providers; `ui` highlight helpers). Engine + UI `tsc --noEmit` clean. App `next build` + `tsc` clean.

## Run it

```bash
npm install
npm run build:corpus         # chunk corpus/*/source.md -> chunks.json
npm run build:embeddings     # precompute semantic vectors -> embeddings.json (transformers.js, no key)

# glass-box CLI (offline, BM25):
npm run demo -- cricket what is leg before wicket
# keyword vs semantic, side by side:
npm run demo:compare -- cricket the ball hits the pad and would have hit the stumps

npm test                     # 24 tests
npm run build -w @rag-glassbox/standalone && npm start -w @rag-glassbox/standalone   # the app
```

Keyword mode needs nothing. Semantic mode uses the committed `embeddings.json` + an in-browser query embedding (no key), or a hosted embedding key. Answer generation needs a local Ollama model or an API key (see `apps/standalone/.env.example`).

## Still open (deliberately)

- **The mutteal.com hosted page** (retrieval-only surface) is a separate deployment integration — the engine, UI, precomputed embeddings, and `retrievalOnly` prop are all in place for it.
- **Model quality:** MiniLM is a small, fast default. A stronger embedding model would change (not eliminate) the failure cases above — swap via env.
- **In-browser semantic** is wired and the client bundle builds, but hasn't been exercised in a real browser here (no browser in the build environment); the ranking logic behind it is verified over HTTP with a posted vector.
