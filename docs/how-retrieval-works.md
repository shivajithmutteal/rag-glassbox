# How Retrieval Works — a from-scratch guide to RAG

**Audience:** an engineer who has never built a RAG system. No machine-learning background assumed. Every term is explained the first time it appears.

**Goal:** by the end you will understand, in detail, every stage of a standard Retrieval-Augmented Generation (RAG) pipeline — what each part does, *why* it exists, what the alternatives were, and why this project (`rag-glassbox`) made the choices it did. We use our own code as the running example, so you can connect each idea to a real file.

> Throughout, look for two kinds of callout:
> - 🧭 **Alternatives & why not** — the other options we could have used and the reason we didn't.
> - 🔎 **In the code** — where this lives in the repo, so you can go read it.

---

## Table of contents

1. [The problem: why RAG exists](#1-the-problem-why-rag-exists)
2. [The whole pipeline at a glance](#2-the-whole-pipeline-at-a-glance)
3. [Stage 1 — The corpus (the documents)](#3-stage-1--the-corpus-the-documents)
4. [Stage 2 — Chunking (cutting documents into pieces)](#4-stage-2--chunking-cutting-documents-into-pieces)
5. [Interlude — Tokens and tokenization](#5-interlude--tokens-and-tokenization)
6. [Retrieval method A — Keyword search with BM25](#6-retrieval-method-a--keyword-search-with-bm25)
7. [Retrieval method B — Semantic search with embeddings](#7-retrieval-method-b--semantic-search-with-embeddings)
8. [Retrieval method C — Hybrid search](#8-retrieval-method-c--hybrid-search)
9. [Where do the vectors live? The "vector store" question](#9-where-do-the-vectors-live-the-vector-store-question)
10. [Ranking: top-k, the cutoff, and near-misses](#10-ranking-top-k-the-cutoff-and-near-misses)
11. [Prompt assembly: grounding and citations](#11-prompt-assembly-grounding-and-citations)
12. [Generation: the language model](#12-generation-the-language-model)
13. [Putting it together: one query, end to end](#13-putting-it-together-one-query-end-to-end)
14. [The honest truth: retrieval is fragile](#14-the-honest-truth-retrieval-is-fragile)
15. [Design decisions and the roads not taken](#15-design-decisions-and-the-roads-not-taken)
16. [Glossary](#16-glossary)

---

## 1. The problem: why RAG exists

A **Large Language Model (LLM)** — like Claude or GPT — is a program that predicts and generates text. It "knows" a lot because it was trained on a huge amount of text. But it has three problems:

1. **It doesn't know your private data.** It was never trained on your company wiki, your PDFs, or (in our case) a specific document about cricket rules.
2. **Its knowledge has a cutoff date** and can be out of date.
3. **It hallucinates.** When it doesn't know something, it often makes up a confident, wrong answer instead of saying "I don't know."

**RAG — Retrieval-Augmented Generation** — is the standard fix. The idea in one sentence:

> Before asking the LLM to answer, **find** the most relevant pieces of *your* documents and **paste them into the question**, then tell the model: "answer using only these."

So a RAG system has two halves:

- **Retrieval** — search your documents and pull out the few most relevant snippets. *This is the hard, interesting part, and what this document is about.*
- **Generation** — hand those snippets plus the user's question to an LLM and let it write the final answer.

The name says it: *Generation*, *Augmented* by *Retrieval*. The quality of a RAG system is mostly decided by the retrieval half — if you retrieve the wrong snippets, even the smartest model will give a wrong or "I don't know" answer. That's why this project is called **glass-box RAG**: it makes the retrieval step visible so you can *see* whether it worked.

---

## 2. The whole pipeline at a glance

There are two phases. The first happens once, ahead of time (**indexing**). The second happens every time a user asks a question (**query time**).

```
  INDEXING (done once, offline)                 QUERY TIME (every question)
  ─────────────────────────────                 ───────────────────────────
  documents (.md)                               user question
        │                                              │
   [chunking]  ── cut into small pieces          [same tokenizer / same
        │                                          embedding model]
        ▼                                              │
   chunks ──────────► chunks.json                     ▼
   a vector per chunk ► embeddings.json       [retrieve]  ── score every
        │                                          chunk vs the question,
        ▼                                          rank them, keep the top few
   saved to disk                        ──────►         │
                                                        ▼
                                                [prompt assembly] ── paste the
                                                  top chunks into a prompt
                                                        │
                                                        ▼
                                                [generation] ── the LLM writes
                                                  the answer, citing sources
```

The rest of this document walks each box, left to right.

🔎 **In the code — what indexing actually saves:** the two build scripts each persist exactly one artifact — **chunking** is `scripts/build-corpus.ts` (a thin wrapper over the real chunker in `packages/engine/src/chunk.ts`) → `corpus/<name>/chunks.json`, and **embeddings** is `scripts/build-embeddings.ts` → `corpus/<name>/embeddings.json`. The **BM25 keyword index is *not* built by any script**: it's cheap, so it's rebuilt in memory on every query (`new Bm25Index(chunks)` in `packages/engine/src/retrieve.ts`; logic in `packages/engine/src/bm25.ts`), whereas embeddings are expensive and so are precomputed once and committed. (That asymmetry — persist the costly index, rebuild the cheap one — is a deliberate, common RAG pattern.) **Query time** is `packages/engine/src/retrieve.ts` (retrieval) and `packages/engine/src/rag.ts` (assembly + generation).

---

## 3. Stage 1 — The corpus (the documents)

The **corpus** is just "all the documents you want to search." (Plural: *corpora*.) In this project the corpus for a topic is a single Markdown file, e.g. `corpus/cricket/source.md` — a well-structured document about the rules of cricket, with headings (`## Methods of Dismissal`, `### Leg Before Wicket (LBW)`, and so on).

That's the raw material. It could just as easily be a pile of PDFs, a website, a database export, or Slack messages. The pipeline downstream doesn't care where the text came from — it only cares about *text with some structure*.

🧭 **Alternatives & why not.** Real systems often ingest many messy formats (PDF, HTML, DOCX). We deliberately used clean Markdown with clear headings because good structure makes the *next* step (chunking) dramatically easier and the whole demo easier to reason about. In production you'd add a "loader/parser" step in front to convert messy formats into clean text — but that's orthogonal to how retrieval works.

---

## 4. Stage 2 — Chunking (cutting documents into pieces)

### What it is

A document might be 3,000 words. You can't and shouldn't retrieve a whole document — it's too big to paste into a prompt, and most of it is irrelevant to any single question. So you cut the document into small pieces called **chunks**. A chunk is the *unit of retrieval*: when we "retrieve," we retrieve chunks, not whole documents.

Think of it like this: a textbook is the document; the chunks are individual paragraphs. When you have a specific question, you want the right paragraph, not the whole book.

### Why the way you chunk matters a lot

Chunking is the most underrated step in RAG. If you chop badly, you sabotage everything downstream:

- **Chunks too big** → each chunk covers many topics, so its "relevance" to a specific question is diluted, and you waste prompt space.
- **Chunks too small** → a single idea gets split across two chunks, so no single chunk fully answers the question.
- **Chunks that straddle unrelated sections** → a chunk that's half about "Run Out" and half about "Extras" matches poorly and confuses the model.

### How we do it

Our chunker is **heading-aware and size-bounded**:

1. It splits the Markdown into **blocks** (paragraphs, list groups), remembering which heading each block lives under (its "section path," e.g. `Methods of Dismissal > LBW`).
2. It **packs blocks together greedily** up to a target size (~180 tokens — see the next section for what a "token" is).
3. It **never lets a chunk cross a section boundary.** When the heading changes, the current chunk is closed and a new one starts.

The result: every chunk stays within one coherent section and maps cleanly back to one heading. That last property is also what powers the glass box's ability to highlight *exactly* where in the source a retrieved chunk came from.

There's an optional **overlap** setting: when one long section is split into several chunks, you can repeat the last bit of one chunk at the start of the next. This prevents an idea that lands right on a chunk boundary from being lost. We default overlap to 0 for the demo (clean, non-duplicated highlights), but it's a knob.

🧭 **Alternatives & why not.**
- **Fixed-size chunking** (e.g. "every 500 characters") — simplest, but blindly cuts sentences and topics in half. We rejected it because it produces incoherent chunks.
- **Sentence or recursive splitting** (split on paragraphs, then sentences, then words until pieces fit) — a common library default (e.g. LangChain's `RecursiveCharacterTextSplitter`). Good and general. Our heading-aware approach is a specialization that exploits the fact that our documents have clean headings, giving cleaner section boundaries and better source highlighting.
- **"Semantic chunking"** (use an embedding model to detect topic shifts and cut there) — fancier and sometimes better, but slower, harder to explain, and overkill for well-structured docs. We chose predictability over cleverness.

🔎 **In the code:** `packages/engine/src/chunk.ts`. Each chunk records its text, section path, character range in the source, and token count.

---

## 5. Interlude — Tokens and tokenization

You'll see the word **token** everywhere in this field, so let's nail it down.

A **token** is a small unit of text — very roughly, a word or a word-piece. **Tokenization** is the act of splitting text into tokens.

Two different parts of our system tokenize, for two different purposes:

1. **Our own simple tokenizer** (for keyword search). It lowercases the text and splits on anything that isn't a letter or digit. So `"Leg before wicket!"` becomes `["leg", "before", "wicket"]`. This is deliberately crude and dependency-free — it's all keyword search needs.

2. **The embedding model's tokenizer** (for semantic search). Neural models have their own, more sophisticated tokenizers that can break rare words into pieces (e.g. `"tokenization"` → `"token"` + `"ization"`). You don't control this one; it ships with the model.

Why care? Because "size" in RAG is almost always measured in tokens, not characters or words. Our chunk target of "~180 tokens" and an LLM's "max 1,024 output tokens" both use this unit. A rough rule of thumb for English: **1 token ≈ 0.75 words**, or ~4 characters.

🔎 **In the code:** our tokenizer is the whole of `packages/engine/src/tokenize.ts` — four lines.

---

Now the heart of the system. There are three ways to search the chunks. We'll build each from first principles.

## 6. Retrieval method A — Keyword search with BM25

### The starting intuition

The oldest idea in search: **a chunk is relevant to a query if it contains the query's words.** Search "eleven players," prefer chunks that contain "eleven" and "players."

The naive version — just count matching words — is bad for three reasons. **BM25** is a formula that fixes all three. BM25 (it stands for "Best Matching," attempt #25 — it's an old, battle-tested algorithm from the 1990s) is still the default keyword-search ranking in systems like Elasticsearch. Let's derive it by fixing the naive version one problem at a time.

### Problem 1: common words shouldn't count as much as rare words

If you search "the offside rule," the word "the" appears in almost every chunk, so counting it tells you nothing. The word "offside" appears in very few chunks, so it's highly informative. We want rare words to count for *more*.

The fix is a weight called **IDF — Inverse Document Frequency.**

- **Document Frequency (DF)** of a word = how many chunks contain it.
- **IDF** = a number that is *large when DF is small* (rare word) and *small when DF is large* (common word). "Inverse" because it moves opposite to frequency.

The standard formula (the one in our code) is:

```
idf(term) = ln( 1 + (N - df + 0.5) / (df + 0.5) )
```

where `N` is the total number of chunks and `df` is how many contain the term, and `ln` is the natural logarithm (a function that grows slowly — it dampens extremes). You don't need to memorize it; the *shape* is all that matters: **rare word → big IDF; ubiquitous word → IDF near zero.** The `+ 0.5` and `+ 1` are smoothing terms that keep the math well-behaved and non-negative.

### Problem 2: more occurrences should help, but with diminishing returns

If "wicket" appears once in a chunk, that's a good sign. If it appears 10 times, that's a *better* sign — but not 10× better. The 2nd occurrence adds a lot; the 20th adds almost nothing. This is called **term-frequency saturation.**

BM25 controls this with a parameter called **`k1`** (we use `k1 = 1.5`). Mechanically, term frequency `f` is fed through `f / (f + k1·…)`, a curve that rises quickly then flattens out. Small `k1` → saturates fast (occurrences past the first barely matter). Large `k1` → closer to raw counting.

### Problem 3: long chunks have an unfair advantage

A long chunk contains more words, so by pure chance it's more likely to contain your query words. That's not real relevance — it's just size. BM25 corrects for this with **length normalization**, controlled by a parameter **`b`** (we use `b = 0.75`). It compares each chunk's length to the *average* chunk length and penalizes chunks that are longer than average. `b = 0` means "ignore length entirely"; `b = 1` means "fully normalize by length"; `0.75` is the well-tested middle ground.

### The whole BM25 formula

Put the three fixes together. For a query, BM25 scores a chunk by summing, over each query term, this quantity:

```
             IDF(term)  ×  ( f × (k1 + 1) )
score += ─────────────────────────────────────────────
          f + k1 × ( 1 − b + b × (chunkLength / avgLength) )
```

- `f` = how many times the term appears in this chunk (term frequency).
- `IDF(term)` = the rarity weight from Problem 1.
- `k1` = the saturation knob from Problem 2.
- `b` and `chunkLength / avgLength` = the length-normalization from Problem 3.

Read it as: **"for each query word, add its rarity weight, boosted by how often it appears (with diminishing returns), discounted if this chunk is unusually long."** Sum that over all query words and you have the chunk's score. A chunk containing none of the query's words scores exactly 0.

### Strengths and weaknesses

- ✅ **Precise on exact words, names, codes, IDs.** If you search "LBW" or "Q → dash-dash-dot-dash," BM25 nails the literal match. This is why it's excellent for our Morse-code corpus, which is full of exact lookups.
- ✅ **Fast, transparent, zero dependencies, needs no model or API key.** You can compute it with pure arithmetic.
- ❌ **It's blind to meaning.** It has no idea that "batsman," "batter," and "striker" mean the same thing. Search one, and chunks that only use the synonyms score 0. It matches *strings*, not *concepts*.

🧭 **Alternatives & why not.**
- **Plain TF-IDF** — the predecessor to BM25 without the saturation (`k1`) and length (`b`) refinements. BM25 is strictly the better-behaved successor; no reason to use plain TF-IDF today.
- **Boolean / exact substring search** (`String.includes`) — trivial, but gives you no *ranking* (everything either matches or doesn't), which is useless when you need "the 3 most relevant."

🔎 **In the code:** `packages/engine/src/bm25.ts`. Constructing a `Bm25Index` counts term and document frequencies; `.score(query)` then returns a number for every chunk. Because it's so cheap, this app rebuilds the index per query inside `retrieve.ts` rather than persisting it (in contrast to the embeddings, which are precomputed once).

---

## 7. Retrieval method B — Semantic search with embeddings

Keyword search's fatal flaw is that it doesn't understand meaning. **Semantic search** fixes exactly that. This section has more new vocabulary, so we'll go slowly.

### The core idea: turn text into coordinates

Imagine a giant map where every possible piece of text is placed at a point, arranged so that **texts with similar meaning sit close together.** "How many players on a team?" and "team size" would be neighbors; "photosynthesis" would be far away.

That's the whole idea of an **embedding**: an embedding is a list of numbers (a **vector**) that represents a piece of text's *meaning* as a position in space. Similar meaning → nearby vectors. Different meaning → distant vectors.

A **vector** here is just an ordered list of numbers, like `[0.03, -0.51, 0.12, …]`. The number of values in the list is its number of **dimensions**. Our embedding model produces **384-dimensional** vectors — i.e. each piece of text becomes a list of 384 numbers. You can't picture 384 dimensions, but the intuition from 2-D (points on a map) carries over exactly: closeness = similarity.

### Where do the numbers come from?

From an **embedding model** — a neural network trained on enormous amounts of text specifically so that it places similar-meaning texts near each other. We use a small, well-known open model called **`all-MiniLM-L6-v2`** (384 dimensions). Key points for a newcomer:

- We **don't train** anything. Training a model like this takes huge compute. We just **run** it (this is called **inference**): text in, vector out.
- The model reads the text and internally produces one vector *per token*. To get a single vector for the whole chunk, we **average** all the token vectors together — this is called **mean pooling**. ("Pooling" = combining many vectors into one; "mean" = we use the average.)
- Finally we **normalize** the vector: scale it so its length is exactly 1. (Length here means the geometric length of the arrow from the origin to the point — see below.) Normalizing makes the next step, comparing vectors, cleaner and faster.

So: **chunk text → model → 384 token-vectors → mean-pool → normalize → one 384-D unit vector.** We do this once for every chunk at indexing time, and once for the user's question at query time — *using the same model both times*, which is essential (two different models produce vectors in incompatible "spaces" that can't be compared).

### Measuring similarity: cosine similarity

Now we have the question as a vector and each chunk as a vector. How do we measure "closeness"? The standard tool is **cosine similarity.**

Picture each vector as an **arrow** from the origin (the center) to its point. Two arrows pointing in nearly the same **direction** represent similar meanings, regardless of how long they are. Cosine similarity measures the **angle** between two arrows:

- Same direction (angle 0°) → cosine = **1.0** (maximally similar).
- Perpendicular (90°) → cosine = **0** (unrelated).
- Opposite (180°) → cosine = **−1** (opposite).

The formula uses two pieces:

- The **dot product** of two vectors `a` and `b`: multiply them element-by-element and sum: `a₁b₁ + a₂b₂ + … + a₃₈₄b₃₈₄`.
- The **magnitude** (length) of a vector: `√(a₁² + a₂² + … )`.

```
cosine(a, b) = dotProduct(a, b) / ( magnitude(a) × magnitude(b) )
```

Dividing by the magnitudes is what makes it about *direction only*, not length. **Nice shortcut:** because we normalized every vector to length 1, the magnitudes are both 1, so cosine similarity is *just the dot product*. That's a small but real efficiency win, and it's why normalizing during indexing is worth it.

To rank chunks semantically: compute the cosine similarity between the query vector and every chunk vector, and sort from highest to lowest.

### Strengths and weaknesses

- ✅ **Understands meaning and synonyms.** "How can a batter be dismissed?" can match a chunk that says "a striker is out when…" even with no shared words. This is the whole point.
- ✅ **Handles paraphrases and vague questions** that keyword search whiffs on.
- ❌ **It can be "distracted" by dominant words.** As we found empirically in this very project (see §14), the query "what is leg before wicket" pulls the vector toward the strong concept "wicket," so the model ranks chunks about stumps and hit-wicket above the actual LBW chunk. Semantic is not magic.
- ❌ **Needs a model.** Running the model costs compute (or an API call). It's heavier than BM25.
- ❌ **Quality depends on the model.** A small model like MiniLM is fast but less nuanced than a large one; a bigger model changes (but never fully eliminates) the failure cases.

🧭 **Alternatives & why not.**
- **Bigger / hosted embedding models** (OpenAI `text-embedding-3`, Voyage AI, etc.) — more accurate, but need an API key and cost money. We made them **optional overrides** (set a key and they're used) but defaulted to the small local model so the project runs with **zero keys**.
- **Anthropic embeddings?** There is no first-party Anthropic embeddings API — Anthropic recommends Voyage AI — so semantic search here is never Claude; Claude is only used for the final answer.

🔎 **In the code:** the cosine math is `packages/engine/src/vector.ts`; producing vectors is `scripts/build-embeddings.ts` (indexing) and `apps/standalone/src/lib/browser-embed.ts` (the query, in the browser). The embedding **provider** interface that lets you swap models is `packages/engine/src/providers/`.

---

## 8. Retrieval method C — Hybrid search

Keyword and semantic have *complementary* weaknesses. Keyword nails exact terms but misses synonyms; semantic catches meaning but can be distracted and misses exact tokens. The obvious move: **use both and combine their scores.** That's **hybrid search.**

The catch is that the two scores live on **different scales**. BM25 scores are unbounded positive numbers (0, 3.3, 7.6, …). Cosine scores live in −1…1 (in practice often 0.3…0.9). You can't just add them — the BM25 numbers would dominate. You must put both on a common scale first.

Our approach, **min-max normalization + weighted sum**:

1. **Normalize each set of scores to the 0…1 range.** For each method, find the min and max score across the current candidate chunks, then rescale every score with `(score − min) / (max − min)`. Now the best chunk in each method is 1.0 and the worst is 0.0, for *both* methods.
2. **Blend with a weight.** `final = w × semanticScore + (1 − w) × keywordScore`, where `w` (the "semantic weight," a slider in the UI, default 0.5) decides how much each method matters. `w = 1` is pure semantic, `w = 0` is pure keyword, `0.5` is an even blend.

Hybrid is often the most robust choice, because a chunk has to look good to *at least one* method to score well, and looking good to *both* pushes it to the top.

> ⚠️ **A subtle nuance to internalize:** min-max normalization is *relative to the current result set*. The "1.0" means "the best among these candidates," not "a perfect match in some absolute sense." So the normalized scores are great for *comparing* chunks within one query, but you can't compare a 0.8 from one query to a 0.8 from another. This is a common source of confusion when people try to set a fixed "relevance threshold."

🧭 **Alternatives & why not.**
- **Reciprocal Rank Fusion (RRF)** — the other popular way to combine. Instead of blending scores, it blends *ranks*: a chunk's fused score is `Σ 1/(k + rank_in_each_method)`. It's elegant because it sidesteps the scale problem entirely (ranks are already comparable) and is robust. **Why we didn't:** RRF throws away the raw score magnitudes, but this project's whole purpose is to *show* those magnitudes in the glass box (the score bars, the gap between #1 and #2). Weighted min-max keeps the magnitudes visible and gives users a meaningful slider to play with. For a production system that only cares about final quality, RRF is a very reasonable alternative.

🔎 **In the code:** `packages/engine/src/retrieve.ts` — see `minMaxNormalize` and the fusion in `retrieve()`.

---

## 9. Where do the vectors live? The "vector store" question

You have a vector for every chunk. At query time you need to compare the query vector against all of them. Where do you keep those vectors, and how do you search them? This is the **vector store** question, and it's where a lot of RAG tutorials point you at heavy infrastructure. We deliberately didn't need any.

### What we do: a committed JSON file + brute-force search

We precompute all chunk vectors once and save them to a plain file (`corpus/<name>/embeddings.json`). At query time we load that file and compute cosine similarity between the query and **every** chunk, one by one, then sort. Comparing against every item is called **brute-force** (or exact / linear) search — its cost grows linearly with the number of chunks (written `O(N)`).

For our corpora (dozens to a couple hundred chunks) brute force is *instant* and *exact*. No database, no server, no index to maintain. This is the right call for small corpora and it keeps the whole project runnable with `git clone && npm install`.

### When brute force stops being enough

Brute force means "touch every vector on every query." At a few hundred vectors that's nothing. At **millions** of vectors it becomes too slow. Then you switch to an **ANN — Approximate Nearest Neighbor** — index. "Nearest neighbor" = the closest vectors to the query; "approximate" = it's willing to occasionally miss the *exact* closest in exchange for being enormously faster (sub-linear). The popular ANN algorithm is **HNSW** (a graph you can hop through to reach near neighbors quickly). You rarely implement ANN yourself; you use a **vector database** that provides it.

🧭 **Alternatives & why not.**
- **Dedicated vector databases** (Pinecone, Weaviate, Milvus, Qdrant) — managed services/servers built for storing and ANN-searching millions of vectors. Overkill and extra infrastructure for a demo with hundreds of chunks.
- **Postgres + `pgvector`** — add vector search to a database you may already run. Great for production; unnecessary infra here.
- **In-process libraries** (FAISS, `hnswlib`) — give you an ANN index without a separate server. Still more than we need at this scale.
- **Our choice — a JSON file + brute force** — zero infrastructure, exact results, trivially inspectable. The honest rule: *don't add a vector database until brute force is actually too slow.* For most side projects and many real apps, that day never comes.

### Two more design choices worth understanding

- **Precompute vs. compute-on-the-fly.** We embed the *chunks* once, offline (`build:embeddings`), and commit the vectors. We only embed the *query* live. This is standard and important: embedding thousands of chunks on every request would be slow and wasteful; the chunks don't change between requests, so embed them once.
- **Where the query gets embedded.** In this project the chunk vectors are precomputed, and the *query* is embedded **in the user's browser** (the same small model, running in WebAssembly) — so no embedding model runs on our server at all. This keeps the hosted demo cheap and safe (no server-side AI calls to pay for or abuse) and is exactly the design the hosted site uses. If you configure a hosted embedding key instead, the server does the query embedding. Either way, the rule holds: **query and chunks must be embedded by the same model**, or their vectors aren't comparable.

🔎 **In the code:** `apps/standalone/src/lib/embeddings.ts` (loads precomputed vectors, decides where the query is embedded) and `scripts/build-embeddings.ts` (the offline precompute).

---

## 10. Ranking, top-k, and near-misses

Whatever method we used (keyword, semantic, or hybrid), we now have a score for every chunk. The final retrieval steps:

1. **Sort** all chunks by score, highest first.
2. **Keep the top `k`** — a small number the user controls (default 3). These are the chunks that "made the cut" and will be fed to the LLM. `k` is a classic trade-off: too small and you might miss the chunk with the answer; too large and you flood the prompt with noise (and cost).
3. **Also keep the next few "near-misses"** — the chunks just *below* the cutoff (ranks `k+1`, `k+2`, …).

That third step is unusual and it's the soul of this project. Normal RAG systems throw the near-misses away silently. We keep and display them, because they answer the question every RAG debugger actually asks: *"was the right chunk almost retrieved, or nowhere close?"* Seeing the cutoff line — and what sits just under it — is how you learn whether your retrieval is one notch off or fundamentally lost.

🔎 **In the code:** `packages/engine/src/retrieve.ts`. The function returns a **`RetrievalTrace`**: the top-`k` `results`, the `nearMisses` just below, and each chunk's individual keyword/semantic scores. That object is everything the UI needs to draw the glass box.

---

## 11. Prompt assembly: grounding and citations

Retrieval is done; we have the best few chunks. Now we build the actual text we send to the LLM. This is the **prompt**, and it has two parts.

**A system instruction** (the "rules" for the model). Ours says, in effect:

> "You are a retrieval-augmented assistant. Answer the question using **only** the numbered sources provided. Cite the sources you use with bracketed numbers like [1]. If the sources don't contain the answer, say you don't know rather than guessing."

This instruction is what turns a general chatbot into a *grounded* one. "Grounded" means the answer must be based on the provided sources, not the model's own memory. The "say you don't know" clause is the anti-hallucination guardrail — it gives the model explicit permission to decline, which is exactly what you want when retrieval came up empty.

**A user message** built from the retrieved chunks, numbered:

```
Question: how many players are on a cricket team?

Sources:
[1] (Teams and Player Roles)
Each team has eleven players. …

[2] (Objective and Overview)
…

Answer the question using only the sources above, citing them with [n].
```

The numbering is what makes **citations** possible: when the model writes "a team has eleven players [1]," the `[1]` points back to the exact chunk, so a reader (or the UI) can verify the claim against the source. Citations are how RAG earns trust — the answer is auditable.

🧭 **Alternatives & why not.** You could skip citations, or stuff whole documents instead of chunks. Both are worse: no citations means no way to check the answer; whole documents blow the token budget and bury the relevant sentence in noise. Numbered chunks + a cite-your-sources instruction is the standard, and it's what makes the glass box's "show the exact prompt" feature meaningful.

🔎 **In the code:** `packages/engine/src/rag.ts` — `RAG_SYSTEM_PROMPT` and `buildRagPrompt()`.

---

## 12. Generation: the language model

Finally, the assembled prompt goes to an LLM, which reads the sources and the question and **generates** the answer, one token at a time. We **stream** those tokens back so the user sees the answer appear live instead of waiting for the whole thing.

This project is **provider-agnostic** — it can use different LLMs behind a common interface (a `GenerationProvider`):

- **Local by default: Ollama.** Ollama runs open models on your own machine, so the whole thing works with no API key and no data leaving your computer.
- **Override with a hosted model:** set `ANTHROPIC_API_KEY` and it uses **Claude** (via Anthropic's official SDK, model `claude-opus-4-8`, streamed); or `OPENAI_API_KEY` for GPT models.

The key insight: **retrieval and generation are decoupled.** The retrieval half doesn't care which model writes the answer, and you can swap the model without touching any retrieval code. In fact, the *hosted* version of this demo skips generation entirely and shows only retrieval — because retrieval is the interesting, hard part, and generation is a swappable commodity.

🧭 **Alternatives & why not.** We put the swap behind a small interface rather than hard-coding one model, because "bring your own model" is a core goal. The Claude adapter uses Anthropic's official SDK (the correct, supported way to call Claude) and lives in the app layer so the core engine stays dependency-free.

🔎 **In the code:** the `GenerationProvider` interface and Ollama/OpenAI adapters are in `packages/engine/src/providers/`; the Claude adapter is `apps/standalone/src/lib/anthropic.ts`.

---

## 13. Putting it together: one query, end to end

Let's trace the question **"how is a batter out lbw?"** through the whole system in hybrid mode.

1. **Indexing already happened** (offline): `cricket/source.md` was chunked into 42 chunks, and each chunk got a 384-D embedding — both saved to disk (`chunks.json` and `embeddings.json`). The BM25 keyword index is *not* saved; it's rebuilt in memory in step 3.
2. **Query arrives.** The browser embeds the question with MiniLM → a 384-D query vector.
3. **Keyword scoring.** A BM25 index is built in memory from the 42 chunks, then scores every chunk on the words "batter," "out," "lbw." Chunks literally containing "lbw" and "out" score high.
4. **Semantic scoring.** Cosine similarity between the query vector and all 42 chunk vectors. Chunks *about the concept of being dismissed* score high, even ones that don't contain the exact words.
5. **Fusion.** Both score sets are min-max normalized to 0…1 and blended (`0.5 × semantic + 0.5 × keyword`).
6. **Rank & cut.** Sort by blended score; keep the top 3 (`results`) and the next 2 (`nearMisses`).
7. **Assemble the prompt.** The 3 top chunks are numbered into the sources block, under the grounding system instruction.
8. **Generate.** The LLM writes a grounded, cited answer, streamed to the screen.
9. **The glass box shows all of it** — the ranked chunks with their keyword and semantic sub-scores, the cutoff line, the near-misses, and the exact prompt that was built. You can *see* whether retrieval found the LBW chunk or got distracted.

---

## 14. The honest truth: retrieval is fragile

Most RAG tutorials imply "keyword is dumb, semantic is smart, use semantic." Building this project and actually measuring it proved that's too simple. Two real, reproducible findings from our cricket corpus:

**Finding 1 — the same word can fool *both* methods.** For the bare query **"what is leg before wicket":**
- *Keyword* matches the words "wicket"/"leg" and ranks **Run Out #1** and **Leg-Bye #3**, with the real LBW chunk only at #2.
- *Semantic* gets pulled toward the strong concept **"wicket"** and ranks *Stumps*, *Hit Wicket*, and *Bowled* above the real LBW chunk — burying it at **rank 9**, *worse* than keyword.

Both retrievers have the same blind spot here, for different reasons. Semantic is not a magic fix.

**Finding 2 — how you phrase the question matters enormously.** Rephrase the same question as a paraphrase with no shared jargon — **"the ball hits the batter on the pad and would have gone on to hit the stumps"** — and semantic snaps the real LBW chunk to **#1 and #2.** Same corpus, same model, totally different result, purely because of wording.

The lessons a junior engineer should take away:

- **Keyword search** is best for exact terms, names, codes, acronyms (it's superb on our Morse corpus). It fails on synonyms and paraphrases.
- **Semantic search** is best for meaning, synonyms, and vague questions. It fails when a dominant word hijacks the vector, or when the exact token matters more than the vibe.
- **Hybrid** is usually the most robust, because a chunk must satisfy at least one method well.
- **There is no universally best setting.** Retrieval quality depends on the corpus, the chunking, the embedding model, the fusion weight, *and the exact words of the question.* This is precisely why a **glass box** — one that shows scores, near-misses, and the cutoff — is so valuable: it turns "retrieval feels flaky" into "I can see exactly where and why it broke, and what to change."

---

## 15. Design decisions and the roads not taken

| Stage | What we did | Main alternative(s) | Why our choice |
|---|---|---|---|
| Chunking | Heading-aware, size-bounded (~180 tokens), never cross a section | Fixed-size; recursive; semantic chunking | Coherent chunks + clean source highlighting from structured Markdown |
| Keyword search | BM25 (`k1=1.5`, `b=0.75`) | TF-IDF; boolean/substring | Battle-tested ranking; handles rarity, saturation, length; zero deps |
| Semantic search | Embeddings via local MiniLM (384-D), mean-pooled, normalized | Larger hosted models (OpenAI, Voyage) | Runs with **no API key**; hosted models available as opt-in overrides |
| Combining scores | Min-max normalize → weighted sum (tunable slider) | Reciprocal Rank Fusion (RRF) | Keeps raw score magnitudes *visible* for the glass box; user-tunable |
| Vector store | Committed JSON + brute-force cosine | Vector DB (Pinecone…); pgvector; FAISS | Hundreds of chunks → brute force is exact & instant, zero infra |
| Query embedding | In the browser (or hosted key) | Model on our server | No server-side AI calls to pay for or abuse; matches the hosted design |
| Generation | Provider-agnostic; Ollama local default, Claude/OpenAI overrides | Hard-code one model | "Bring your own model"; retrieval stays decoupled from the LLM |
| The whole point | Expose the full retrieval **trace** (scores, near-misses, cutoff, prompt) | Return only the final answer | You can *see* where retrieval succeeds or fails — the reason this project exists |

---

## 16. Glossary

- **RAG (Retrieval-Augmented Generation):** find relevant snippets of your documents and give them to an LLM so it answers from *your* data instead of guessing.
- **LLM (Large Language Model):** a program that generates text (e.g. Claude, GPT). Does the final "answer" step.
- **Corpus / corpora:** the collection of documents you search.
- **Chunk:** a small slice of a document; the unit that gets retrieved.
- **Chunking:** cutting documents into chunks.
- **Token:** a small unit of text (~¾ of a word). Sizes are measured in tokens.
- **Tokenization:** splitting text into tokens.
- **Index:** a precomputed data structure that makes search fast (a BM25 index; a set of embedding vectors).
- **BM25:** the standard keyword-ranking formula; scores chunks by shared words, weighting rare words more, with diminishing returns per repeat and a length penalty.
- **Term frequency (f):** how many times a word appears in a chunk.
- **Document frequency (df):** how many chunks contain a word.
- **IDF (Inverse Document Frequency):** a weight that makes rare words count more than common ones.
- **Embedding:** a list of numbers (a vector) representing a text's *meaning*; similar meanings → nearby vectors.
- **Vector:** an ordered list of numbers.
- **Dimension:** the number of values in a vector (ours: 384).
- **Embedding model:** a neural network that turns text into an embedding (ours: `all-MiniLM-L6-v2`).
- **Inference:** running a trained model to get an output (as opposed to *training* it).
- **Pooling / mean pooling:** combining a model's per-token vectors into one vector, by averaging.
- **Normalize (a vector):** scale it to length 1, so comparisons depend only on direction.
- **Cosine similarity:** a −1…1 measure of how aligned two vectors are (1 = same direction = same meaning).
- **Dot product:** multiply two vectors element-wise and sum; equals cosine similarity when both vectors are normalized.
- **Semantic search:** retrieval by embedding similarity (meaning) rather than shared words.
- **Keyword / lexical search:** retrieval by shared words (e.g. BM25).
- **Hybrid search:** combining keyword and semantic scores.
- **Min-max normalization:** rescaling a set of numbers to the 0…1 range so different score scales can be compared.
- **RRF (Reciprocal Rank Fusion):** an alternative way to combine methods using ranks instead of raw scores.
- **top-k:** the number of highest-scoring chunks you keep.
- **Near-misses:** the chunks just below the top-k cutoff (this project shows them; most hide them).
- **Vector store:** where chunk vectors live and how you search them (a file, or a vector database).
- **Brute-force / linear search:** compare the query to every vector; exact but O(N).
- **ANN (Approximate Nearest Neighbor):** fast, approximate vector search for millions of vectors (e.g. HNSW); what vector databases provide.
- **Grounding:** requiring the model to answer only from the provided sources.
- **Citation:** a reference (like `[1]`) from a claim in the answer back to the source chunk that supports it.
- **Hallucination:** when an LLM confidently states something false; grounding + "say you don't know" fights it.
- **Streaming:** sending the answer token-by-token so it appears live.
- **Provider (embedding/generation):** a swappable adapter for a specific model service (Ollama, OpenAI, Voyage, Claude).
- **Retrieval trace:** the full record of what retrieval did — scored chunks, near-misses, the cutoff, and the assembled prompt. The thing the glass box renders.

---

*Want to see all of this live? Run `npm run demo:compare -- cricket the ball hits the pad and would have hit the stumps` to watch keyword and semantic rank the same query differently, then open the app and try the same questions with the mode toggle.*
