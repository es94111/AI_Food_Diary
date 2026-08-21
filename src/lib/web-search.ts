import "server-only";

// Thin, swappable wrapper around Tavily Search API (research.md §1) so the
// brand-search endpoint (route T013) doesn't hardcode a specific search
// provider — only this file would need to change to switch providers.

export class WebSearchNotConfiguredError extends Error {
  constructor() {
    super("TAVILY_API_KEY not configured");
    this.name = "WebSearchNotConfiguredError";
  }
}

// Covers both a timed-out/aborted request and a lower-level connection
// failure (DNS, TLS, non-2xx response) — the route maps both to the same
// user-facing 502 (contracts/brand-search-api.md).
export class WebSearchRequestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WebSearchRequestError";
  }
}

export type WebSearchResult = {
  title: string;
  content: string;
  url: string;
};

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

// Only used as the request's own timeout when the caller doesn't already
// supply a signal (the brand-search route wraps this call together with the
// AI judgement step in one AbortController — see research.md §5).
const WEB_SEARCH_TIMEOUT_MS = Math.max(1000, numberEnv("WEB_SEARCH_TIMEOUT_MS", 10_000));

export async function webSearch(query: string, options: { signal?: AbortSignal } = {}): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new WebSearchNotConfiguredError();
  }

  const internalController = options.signal ? null : new AbortController();
  const timeoutId = internalController ? setTimeout(() => internalController.abort(), WEB_SEARCH_TIMEOUT_MS) : null;
  const signal = options.signal ?? internalController!.signal;

  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        include_answer: false
      }),
      signal
    });

    if (!response.ok) {
      throw new WebSearchRequestError(`Tavily search failed with status ${response.status}`);
    }

    const data = (await response.json()) as { results?: Array<{ title?: string; content?: string; url?: string }> };
    return (data.results ?? []).map((result) => ({
      title: result.title ?? "",
      content: result.content ?? "",
      url: result.url ?? ""
    }));
  } catch (err) {
    if (err instanceof WebSearchRequestError) throw err;
    throw new WebSearchRequestError("Tavily search request failed", { cause: err });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
