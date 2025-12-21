import type { Tab } from "@teatime-ai/api/common";
import Keyv from "keyv";

type CacheKey = string;

type Entry = {
  seq: number;
  tab: Tab;
};

const CHAT_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
const tabSnapshotCache = new Keyv<Entry>({ namespace: "chatContext:tabSnapshot" });
const sessionIndexCache = new Keyv<string[]>({ namespace: "chatContext:tabSnapshotIndex" });

function buildKey(input: { sessionId: string; clientId: string; tabId: string }): CacheKey {
  return `tabSnapshot:${input.sessionId}:${input.clientId}:${input.tabId}`;
}

function buildSessionIndexKey(input: { sessionId: string }) {
  return `tabSnapshotIndex:${input.sessionId}`;
}

async function registerKeyInSessionIndex(input: { sessionId: string; key: CacheKey }) {
  const indexKey = buildSessionIndexKey(input);
  const list = (await sessionIndexCache.get(indexKey)) ?? [];
  // 中文注释：用 list 做轻量索引，保证在不支持 key 枚举的后端也能按 session 清理。
  if (!list.includes(input.key)) {
    list.push(input.key);
  }
  await sessionIndexCache.set(indexKey, list, CHAT_CONTEXT_TTL_MS);
}

export const chatContextStore = {
  /** Upsert a tab snapshot (use seq to prevent out-of-order overwrite). */
  upsertTabSnapshot: async (input: {
    sessionId: string;
    clientId: string;
    tabId: string;
    seq: number;
    tab: Tab;
  }) => {
    const key = buildKey(input);
    // 中文注释：用 seq 解决乱序/重复包，避免旧快照覆盖新快照。
    const existing = await tabSnapshotCache.get(key);
    if (existing && input.seq <= existing.seq) return;
    await tabSnapshotCache.set(key, { seq: input.seq, tab: input.tab }, CHAT_CONTEXT_TTL_MS);
    await registerKeyInSessionIndex({ sessionId: input.sessionId, key });
  },

  /** Read a tab snapshot (auto-expires by TTL). */
  getTabSnapshot: async (input: { sessionId: string; clientId: string; tabId: string }): Promise<Tab | null> => {
    const key = buildKey(input);
    const entry = await tabSnapshotCache.get(key);
    return entry?.tab ?? null;
  },

  /** Clear all chat context entries for a session. */
  clearSession: async (input: { sessionId: string }) => {
    const indexKey = buildSessionIndexKey(input);
    const keys = (await sessionIndexCache.get(indexKey)) ?? [];
    if (keys.length) {
      await tabSnapshotCache.deleteMany(keys);
    }
    await sessionIndexCache.delete(indexKey);
  },
} as const;
