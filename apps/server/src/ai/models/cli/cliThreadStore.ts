import { prisma } from "@teatime-ai/db";

export type CliThreadInfo = {
  /** CLI type prefix. */
  cliType: string;
  /** CLI thread id. */
  threadId: string;
  /** Raw cliId value. */
  cliId: string;
};

export type CliThreadCacheEntry = {
  /** CLI type prefix. */
  cliType: string;
  /** CLI thread id. */
  threadId: string | null;
  /** CLI thread instance. */
  thread: unknown;
  /** Last used timestamp in ms. */
  lastUsedAt: number;
};

/** CLI id separator. */
const CLI_ID_SEPARATOR = "_";
/** CLI thread cache TTL in ms. */
const CLI_THREAD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** CLI thread cache max size. */
const CLI_THREAD_CACHE_MAX = 10;
/** CLI thread cache map. */
const cliThreadCache = new Map<string, CliThreadCacheEntry>();

/** Build a cliId string from cli type and thread id. */
export function buildCliId(cliType: string, threadId: string): string {
  return `${cliType}${CLI_ID_SEPARATOR}${threadId}`;
}

/** Parse a cliId into cli type and thread id. */
export function parseCliId(cliId: string): CliThreadInfo | null {
  const trimmed = cliId.trim();
  if (!trimmed) return null;
  const [cliType, ...rest] = trimmed.split(CLI_ID_SEPARATOR);
  const threadId = rest.join(CLI_ID_SEPARATOR);
  if (!cliType || !threadId) return null;
  return { cliType, threadId, cliId: trimmed };
}

/** Load cliId from the chat session and parse it. */
export async function getCliThreadInfo(sessionId: string): Promise<CliThreadInfo | null> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { cliId: true },
  });
  if (!session?.cliId) return null;
  return parseCliId(session.cliId);
}

/** Get cached thread for a chat session. */
export function getCachedCliThread(sessionId: string): CliThreadCacheEntry | null {
  const entry = cliThreadCache.get(sessionId);
  if (!entry) return null;
  if (isCliThreadCacheExpired(entry)) {
    // 逻辑：过期数据直接清理，避免复用旧 thread。
    cliThreadCache.delete(sessionId);
    return null;
  }
  // 逻辑：读取即刷新 LRU 时间戳。
  const refreshed: CliThreadCacheEntry = {
    ...entry,
    lastUsedAt: Date.now(),
  };
  cliThreadCache.set(sessionId, refreshed);
  return refreshed;
}

/** Store cached thread for a chat session. */
export function setCachedCliThread(sessionId: string, entry: CliThreadCacheEntry): void {
  const nextEntry: CliThreadCacheEntry = {
    ...entry,
    lastUsedAt: Date.now(),
  };
  cliThreadCache.set(sessionId, nextEntry);
  pruneCliThreadCache();
}

/** Clear cached thread for a chat session. */
export function clearCachedCliThread(sessionId: string): void {
  cliThreadCache.delete(sessionId);
}

/** Persist cliId for a chat session. */
export async function setCliThreadInfo(
  sessionId: string,
  cliType: string,
  threadId: string,
): Promise<void> {
  const cliId = buildCliId(cliType, threadId);
  const existing = await prisma.chatSession.findFirst({
    where: { cliId, id: { not: sessionId } },
    select: { id: true },
  });
  // 逻辑：同一 threadId 只能绑定一个 session，避免跨会话复用。
  if (existing) throw new Error("CLI thread already bound to another session.");
  // 逻辑：即使会话未创建，也允许写入 cliId，避免丢失线程绑定。
  try {
    await prisma.chatSession.upsert({
      where: { id: sessionId },
      update: { cliId },
      create: { id: sessionId, cliId },
    });
  } catch (error) {
    if (isCliIdConflict(error)) {
      throw new Error("CLI thread already bound to another session.");
    }
    throw error;
  }
}

/** Clear cliId for a chat session. */
export async function clearCliThreadInfo(sessionId: string): Promise<void> {
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { cliId: null },
  });
}

/** Check if the error is a unique constraint conflict for cliId. */
function isCliIdConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code !== "P2002") return false;
  const meta = (error as { meta?: { target?: string[] | string } }).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.includes("cliId");
  if (typeof target === "string") return target.includes("cliId");
  return true;
}

/** Check whether cache entry expired. */
function isCliThreadCacheExpired(entry: CliThreadCacheEntry): boolean {
  return Date.now() - entry.lastUsedAt > CLI_THREAD_CACHE_TTL_MS;
}

/** Prune CLI thread cache by TTL and max size. */
function pruneCliThreadCache(): void {
  const now = Date.now();
  // 逻辑：先清理过期 entry，避免占用缓存容量。
  for (const [sessionId, entry] of cliThreadCache.entries()) {
    if (now - entry.lastUsedAt > CLI_THREAD_CACHE_TTL_MS) {
      cliThreadCache.delete(sessionId);
    }
  }
  if (cliThreadCache.size <= CLI_THREAD_CACHE_MAX) return;
  // 逻辑：按最近使用时间淘汰最旧 entry。
  let oldestSessionId: string | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;
  for (const [sessionId, entry] of cliThreadCache.entries()) {
    if (entry.lastUsedAt < oldestTime) {
      oldestTime = entry.lastUsedAt;
      oldestSessionId = sessionId;
    }
  }
  if (oldestSessionId) cliThreadCache.delete(oldestSessionId);
}
