/** Small HTTP helpers shared by the fetch-based providers. `fetch` is injectable for testing. */

export type FetchImpl = typeof fetch;

/** Throw a helpful error when a response is not OK; otherwise pass it through. */
export async function ensureOk(res: Response, label: string): Promise<Response> {
  if (res.ok) return res;
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    // ignore body read failures
  }
  throw new Error(
    `${label} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
  );
}

/** Yield a streamed response body one line at a time (for NDJSON / SSE). */
export async function* readLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      yield buf.slice(0, nl);
      buf = buf.slice(nl + 1);
    }
  }
  buf += decoder.decode();
  const rest = buf.trim();
  if (rest) yield rest;
}
