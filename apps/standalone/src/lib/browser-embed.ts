// Client-side query embedding via transformers.js (WASM), using the same model the
// corpus was precomputed with. This keeps the semantic path zero-key and server-model-free:
// the browser embeds the query, the server ranks against committed chunk vectors.

type Extractor = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

export const BROWSER_EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then((m) => {
      m.env.allowLocalModels = false;
      return m.pipeline('feature-extraction', BROWSER_EMBED_MODEL) as unknown as Promise<Extractor>;
    });
  }
  return extractorPromise;
}

/** Embed a query string in the browser. First call lazily downloads the model (~25MB). */
export async function embedQuery(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}
