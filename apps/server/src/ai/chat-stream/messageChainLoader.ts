import { prisma } from "@teatime-ai/db";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";

/** Default max messages in a chain. */
const DEFAULT_MAX_MESSAGES = 80;

/** Load a message chain based on materialized path. */
export async function loadMessageChain(input: {
  /** Session id. */
  sessionId: string;
  /** Leaf message id. */
  leafMessageId: string;
  /** Max messages to load. */
  maxMessages?: number;
}): Promise<TeatimeUIMessage[]> {
  const sessionId = input.sessionId;
  const maxMessages = Number.isFinite(input.maxMessages)
    ? Number(input.maxMessages)
    : DEFAULT_MAX_MESSAGES;
  const leafId = String(input.leafMessageId || "").trim();
  if (!leafId) throw new Error("leafMessageId is required.");

  const leaf = await prisma.chatMessage.findUnique({
    where: { id: leafId },
    select: {
      id: true,
      sessionId: true,
      path: true,
    },
  });
  if (!leaf || leaf.sessionId !== sessionId || !leaf.path) return [];

  const segments = leaf.path.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  // 基于物化路径一次性拉取祖先节点，避免逐层查询。
  const prefixes = segments.map((_, index) => segments.slice(0, index + 1).join("/"));
  const limited =
    prefixes.length > maxMessages ? prefixes.slice(prefixes.length - maxMessages) : prefixes;

  const rows = await prisma.chatMessage.findMany({
    where: { sessionId, path: { in: limited } },
    orderBy: { path: "asc" },
    select: {
      id: true,
      role: true,
      parentMessageId: true,
      parts: true,
      metadata: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    role: row.role as any,
    parentMessageId: row.parentMessageId ?? null,
    parts: (row.parts as any) ?? [],
    metadata: (row.metadata as any) ?? undefined,
  }));
}
