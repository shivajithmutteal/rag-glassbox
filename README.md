# rag-glassbox

**Glass-box RAG** — retrieval-augmented generation that shows you the *retrieval* step, not just the answer: ranked chunks, similarity scores, the near-misses just below the cutoff, and the exact prompt retrieval assembled. The part most RAG systems hide.

Retrieval is where RAG quietly succeeds or fails. This makes it watchable — flip between **keyword (BM25)**, **semantic**, and **hybrid**, and see *where each one breaks* on the same question.

> 📚 **New to RAG?** [`docs/how-retrieval-works.md`](./docs/how-retrieval-works.md) explains the entire pipeline from scratch — BM25, embeddings, cosine similarity, hybrid fusion, vector stores, and every trade-off — assuming no prior background.

## Quickstart

```bash
npm install
npm run build:corpus         # chunk corpus/*/source.md -> chunks.json
npm run build:embeddings     # precompute semantic vectors (transformers.js, no API key)

# keyword vs semantic, side by side, in the terminal:
npm run demo:compare -- cricket the ball hits the pad and would have hit the stumps

# the full app:
npm run build -w @rag-glassbox/standalone && npm start -w @rag-glassbox/standalone
```

Then open the app and try **"what is leg before wicket"** in each mode — a small lesson in how retrieval actually behaves (see [PROGRESS.md](./PROGRESS.md#highlights--what-the-glass-box-actually-reveals)).

## What's inside

- **`packages/engine`** — a zero-dependency RAG engine: heading-aware chunking, BM25 keyword retrieval, semantic retrieval, the glass-box `retrieve()` trace (results + near-misses + scores), model-agnostic provider seams, and the RAG pipeline.
- **`packages/ui`** — presentational React components: the three-panel glass box (corpus / answer / retrieval trace) and the live mode controls.
- **`apps/standalone`** — a thin Next.js app wiring it all together.
- **`corpus/`** — three fact-checked knowledge bases: cricket rules, football rules, and Morse code.

## Local-first, bring your own model

- **Keyword retrieval** needs nothing — no model, no key.
- **Semantic** uses committed, precomputed corpus embeddings plus an **in-browser** query embedding (same small model), so it works with no key and no server-side model. Set `VOYAGE_API_KEY` or `OPENAI_API_KEY` to use a hosted embedder instead.
- **Answers** default to a local **Ollama** model; override with `ANTHROPIC_API_KEY` (Claude), `OPENAI_API_KEY`, etc.

See [`apps/standalone/.env.example`](./apps/standalone/.env.example).

## Testing

```bash
npm test   # engine + UI unit tests
```

Full build status, the honest keyword-vs-semantic findings, and per-tier verification live in [PROGRESS.md](./PROGRESS.md).
