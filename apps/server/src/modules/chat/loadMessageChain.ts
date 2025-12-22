import { prisma } from "@teatime-ai/db";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";

const DEFAULT_MAX_MESSAGES = 60;

/**
 * Loads a message chain by following `parentMessageId` pointers (MVP).
 */
export async function loadMessageChain(input: {
  sessionId: string;
  leafMessageId: string;
  maxMessages?: number;
}): Promise<TeatimeUIMessage[]> {
  const sessionId = input.sessionId;
  const maxMessages = Number.isFinite(input.maxMessages) ? Number(input.maxMessages) : DEFAULT_MAX_MESSAGES;
  const leafId = String(input.leafMessageId || "").trim();
  if (!leafId) throw new Error("leafMessageId is required.");

  // 从叶子节点向上追溯到根节点，再反转得到“从旧到新”的链路。
  const chain: TeatimeUIMessage[] = [];
  const visited = new Set<string>();

  let currentId: string | null = leafId;
  while (currentId) {
    if (visited.has(currentId)) break; // 防环（异常数据），直接截断。
    visited.add(currentId);

    const row: {
      id: string;
      sessionId: string;
      parentMessageId: string | null;
      role: string;
      parts: unknown;
      metadata: unknown;
    } | null = await prisma.chatMessage.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        sessionId: true,
        parentMessageId: true,
        role: true,
        parts: true,
        metadata: true,
      },
    });

    if (!row || row.sessionId !== sessionId) break;

    chain.push({
      id: row.id,
      role: row.role as any,
      parentMessageId: row.parentMessageId ?? null,
      parts: (row.parts as any) ?? [],
      metadata: (row.metadata as any) ?? undefined,
    });

    if (chain.length >= maxMessages) break;
    currentId = row.parentMessageId ?? null;
  }

  return chain.reverse();
}
