import { prisma } from "@teatime-ai/db";
import {
  MessageRole as MessageRoleEnum,
  type MessageRole as MessageRoleType,
} from "@teatime-ai/db/prisma/generated/client";
import type { UIMessage } from "ai";

/**
 * 将 AI SDK v6 的 `UIMessage` 做持久化（MVP）：
 * - `UIMessage.metadata` -> `ChatMessage.meta`（JSON）
 * - `UIMessage.parts[]` -> `ChatMessagePart.state`（JSON，按 index 排序）
 *
 * 备注：
 * - UIMessage 的 role 只包含 'system' | 'user' | 'assistant'，不包含 'tool'。
 * - Prisma schema 虽然有 TOOL 角色，但当前这条 UI 聊天流只按 UIMessage 处理。
 */
type AnyUIMessage = UIMessage<any, any, any>;

/** UIMessage.role -> DB enum */
function toMessageRole(role: AnyUIMessage["role"]): MessageRoleType {
  switch (role) {
    case "assistant":
      return MessageRoleEnum.ASSISTANT;
    case "system":
      return MessageRoleEnum.SYSTEM;
    case "user":
    default:
      return MessageRoleEnum.USER;
  }
}

/** DB enum -> UIMessage.role */
function fromMessageRole(role: MessageRoleType): AnyUIMessage["role"] {
  switch (role) {
    case MessageRoleEnum.ASSISTANT:
      return "assistant";
    case MessageRoleEnum.SYSTEM:
      return "system";
    case MessageRoleEnum.USER:
    default:
      return "user";
  }
}

/** MVP：不做 parts 转换，直接保存/还原。 */
function normalizeParts(message: AnyUIMessage): AnyUIMessage["parts"] {
  return Array.isArray(message.parts) ? message.parts : [];
}

/**
 * 输入新消息，先保存到数据库，并返回完整历史消息列表（按时间升序）。
 * - `sessionId`：对话会话 ID
 * - `incomingMessage`：刚接收到的消息（通常是 UIMessage 的最后一条）
 */
export async function saveAndAppendMessage({
  sessionId,
  incomingMessage,
}: {
  sessionId: string;
  incomingMessage?: AnyUIMessage;
}): Promise<AnyUIMessage[]> {
  // 用同一事务保证：追加/读取的顺序一致，previousMessageId 稳定。
  return prisma.$transaction(async (tx) => {
    // MVP：确保 session 存在（title 等字段使用 Prisma 默认值）。
    await tx.chatSession.upsert({
      where: { id: sessionId },
      update: {},
      create: { id: sessionId },
    });

    if (incomingMessage) {
      const role = toMessageRole(incomingMessage.role);
      const parts = normalizeParts(incomingMessage);

      // 取上一条消息，用于串联 previousMessageId（便于追溯）。
      const previous = await tx.chatMessage.findFirst({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      await tx.chatMessage.create({
        data: {
          sessionId,
          previousMessageId: previous?.id ?? null,
          role,
          // UIMessage.metadata -> ChatMessage.meta
          meta: (incomingMessage as AnyUIMessage).metadata ?? undefined,
          parts: {
            create: parts.map((part, index) => {
              const type =
                part && typeof part === "object" && "type" in part
                  ? String((part as { type: unknown }).type)
                  : "unknown";
              return {
                index,
                type,
                // 整个 part 作为 JSON 存起来，方便完整还原 UIMessage.parts
                state: part as any,
              };
            }),
          },
        },
      });
    }

    // 读取全量历史（升序），还原为 AI SDK v6 UIMessage[] 供 agent 使用。
    const history = await tx.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      include: { parts: { orderBy: { index: "asc" } } },
    });

    return history.map((message) => {
      const parts = message.parts.map((part) => {
        // 优先还原 state（完整 part），否则只返回 type 占位。
        if (part.state && typeof part.state === "object") return part.state;
        return { type: part.type };
      });
      return {
        id: message.id,
        role: fromMessageRole(message.role),
        metadata: message.meta ?? undefined,
        parts: parts as AnyUIMessage["parts"],
      } satisfies AnyUIMessage;
    });
  });
}
