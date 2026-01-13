import { tool, zodSchema } from "ai";
import { webFetchToolDef, webSearchToolDef } from "@tenas-ai/api/types/tools/system";

/** Max bytes for web fetch response. */
const MAX_WEB_FETCH_BYTES = 1024 * 1024;
/** Default fetch timeout. */
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

/** Web fetch tool output. */
type WebFetchToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Fetched URL. */
    url: string;
    /** HTTP status code. */
    status: number;
    /** Response content type. */
    contentType: string | null;
    /** Response body text. */
    content: string;
  };
};

/** Web search tool output. */
type WebSearchToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Search query string. */
    query: string;
    /** Search results list. */
    results: Array<{
      /** Result title. */
      title: string;
      /** Result URL. */
      url: string;
      /** Optional snippet. */
      snippet?: string;
    }>;
  };
};

/** Validate public URL for web requests. */
function assertPublicUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https urls are allowed.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Localhost is not allowed.");
  }
  if (hostname === "::1") {
    throw new Error("Localhost is not allowed.");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    const [a, b] = hostname.split(".").map((part) => Number(part));
    // 逻辑：拦截常见内网与保留地址段。
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      throw new Error("Private network addresses are not allowed.");
    }
  }
}

/** Fetch response text with timeout and size limit. */
async function fetchTextWithLimit(input: {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ status: number; contentType: string | null; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }
    const contentLength = response.headers.get("content-length");
    const maxBytes = input.maxBytes ?? MAX_WEB_FETCH_BYTES;
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error("Response too large.");
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new Error("Response too large.");
    }
    const text = new TextDecoder().decode(buffer);
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Parse DuckDuckGo response into search results. */
function parseDuckDuckGoResults(payload: any, limit: number): WebSearchToolOutput["data"]["results"] {
  const results: WebSearchToolOutput["data"]["results"] = [];
  const pushEntry = (entry: any) => {
    if (!entry || results.length >= limit) return;
    if (entry.FirstURL && entry.Text) {
      results.push({
        title: entry.Text,
        url: entry.FirstURL,
        snippet: entry.Text,
      });
    }
  };

  if (Array.isArray(payload?.Results)) {
    for (const entry of payload.Results) {
      pushEntry(entry);
      if (results.length >= limit) break;
    }
  }

  if (Array.isArray(payload?.RelatedTopics)) {
    for (const topic of payload.RelatedTopics) {
      if (results.length >= limit) break;
      if (Array.isArray(topic.Topics)) {
        for (const sub of topic.Topics) {
          pushEntry(sub);
          if (results.length >= limit) break;
        }
      } else {
        pushEntry(topic);
      }
    }
  }

  return results.slice(0, limit);
}

/** Fetch web content via http/https. */
export const webFetchTool = tool({
  description: webFetchToolDef.description,
  inputSchema: zodSchema(webFetchToolDef.parameters),
  execute: async ({ url }): Promise<WebFetchToolOutput> => {
    const parsed = new URL(url);
    assertPublicUrl(parsed);
    const response = await fetchTextWithLimit({ url: parsed.toString() });
    return {
      ok: true,
      data: {
        url: parsed.toString(),
        status: response.status,
        contentType: response.contentType,
        content: response.text,
      },
    };
  },
});

/** Perform web search (DuckDuckGo). */
export const webSearchTool = tool({
  description: webSearchToolDef.description,
  inputSchema: zodSchema(webSearchToolDef.parameters),
  execute: async ({ query, limit }): Promise<WebSearchToolOutput> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new Error("query is required.");
    }
    const searchUrl = new URL("https://api.duckduckgo.com/");
    searchUrl.searchParams.set("q", trimmedQuery);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("no_html", "1");
    searchUrl.searchParams.set("skip_disambig", "1");
    const response = await fetchTextWithLimit({
      url: searchUrl.toString(),
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      maxBytes: MAX_WEB_FETCH_BYTES,
    });
    const payload = JSON.parse(response.text);
    const results = parseDuckDuckGoResults(payload, limit ?? 8);
    return { ok: true, data: { query: trimmedQuery, results } };
  },
});
