import { createHash } from "node:crypto";
import { Codex } from "@openai/codex-sdk";

export type CodexClientConfig = {
  /** API base URL override. */
  apiUrl: string;
  /** API key override. */
  apiKey: string;
  /** Force using custom API key. */
  forceCustomApiKey: boolean;
};

type CodexClientEntry = {
  /** Cached client instance. */
  client: Codex;
  /** Last access timestamp. */
  lastUsedAt: number;
};

/** Max cached Codex clients. */
const MAX_CODEX_CLIENTS = 10;
/** Idle time before a client can be evicted. */
const CODEX_CLIENT_IDLE_MS = 24 * 60 * 60 * 1000;
/** Cached clients keyed by normalized config. */
const CODEX_CLIENTS = new Map<string, CodexClientEntry>();
/** Cache key for the default client. */
const DEFAULT_CLIENT_KEY = "default";

/** Build a short fingerprint for the API key. */
function buildApiKeyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

/** Normalize a base URL value. */
function normalizeBaseUrl(apiUrl: string): string {
  return apiUrl.trim();
}

/** Normalize the cache key for a custom client. */
function buildCustomClientKey(input: CodexClientConfig): string {
  const baseUrl = normalizeBaseUrl(input.apiUrl);
  const apiKey = input.apiKey.trim();
  const fingerprint = apiKey ? buildApiKeyFingerprint(apiKey) : "empty";
  // 逻辑：仅存 key 指纹，避免在缓存 key 中出现明文密钥。
  return `custom:${baseUrl}:${fingerprint}`;
}

/** Remove idle or excessive clients from cache. */
function pruneCodexClients(now: number): void {
  // 逻辑：优先清理长时间未使用的实例。
  for (const [key, entry] of CODEX_CLIENTS) {
    if (now - entry.lastUsedAt > CODEX_CLIENT_IDLE_MS) {
      CODEX_CLIENTS.delete(key);
    }
  }
  if (CODEX_CLIENTS.size <= MAX_CODEX_CLIENTS) return;

  const entries = Array.from(CODEX_CLIENTS.entries()).sort(
    (left, right) => left[1].lastUsedAt - right[1].lastUsedAt,
  );
  // 逻辑：超限时按最久未使用淘汰。
  while (CODEX_CLIENTS.size > MAX_CODEX_CLIENTS && entries.length > 0) {
    const [key] = entries.shift() ?? [];
    if (key) CODEX_CLIENTS.delete(key);
  }
}

/** Create a new Codex client instance for the given config. */
function createCodexClient(input: CodexClientConfig): Codex {
  if (!input.forceCustomApiKey) return new Codex();
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Codex SDK 缺少 API Key");
  const baseUrl = normalizeBaseUrl(input.apiUrl);
  return new Codex({
    apiKey,
    baseUrl: baseUrl ? baseUrl : undefined,
  });
}

/** Resolve a cached Codex client for the given config. */
export function getCodexClient(input: CodexClientConfig): Codex {
  const now = Date.now();
  pruneCodexClients(now);

  const key = input.forceCustomApiKey ? buildCustomClientKey(input) : DEFAULT_CLIENT_KEY;
  const existing = CODEX_CLIENTS.get(key);
  if (existing) {
    existing.lastUsedAt = now;
    return existing.client;
  }

  const client = createCodexClient(input);
  CODEX_CLIENTS.set(key, { client, lastUsedAt: now });
  return client;
}

/** Clear all cached Codex clients. */
export function clearCodexClientCache(): void {
  CODEX_CLIENTS.clear();
}
