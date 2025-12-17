import { prisma } from "@teatime-ai/db";
import {
  MessageRole as MessageRoleEnum,
  type MessageRole as MessageRoleType,
} from "@teatime-ai/db/prisma/generated/client";
import { deepseek } from "@ai-sdk/deepseek";
import type { UIMessage } from "ai";
import { generateText } from "ai";

const DEBUG_AI_STREAM = process.env.TEATIME_DEBUG_AI_STREAM === "1";

function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return -1;
  }
}

function summarizeParts(parts: any[]) {
  return parts.map((p, index) => ({
    index,
    type: p && typeof p === "object" && "type" in p ? String((p as any).type) : "unknown",
    size: safeJsonSize(p),
  }));
}

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

/**
 * 标题长度上限（MVP）
 * - `SessionItem.tsx` 里会做 `truncate`，但这里仍限制长度，避免生成过长标题
 */
const MAX_SESSION_TITLE_CHARS = 16;

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

function extractUserText(message: AnyUIMessage): string {
  if (!Array.isArray(message.parts)) return "";
  const chunks: string[] = [];
  for (const part of message.parts as any[]) {
    if (!part || typeof part !== "object") continue;
    // AI SDK v6：用户输入一般是 { type: 'text', text: '...' }
    if (
      (part as any).type === "text" &&
      typeof (part as any).text === "string"
    ) {
      chunks.push((part as any).text);
      continue;
    }
    // 兜底：某些 part 可能只有 text 字段
    if (typeof (part as any).text === "string") {
      chunks.push((part as any).text);
    }
  }
  return chunks.join("\n").trim();
}

function normalizeTitle(raw: string): string {
  let title = (raw ?? "").trim();
  // 去掉常见的包裹符号（引号/书名号等）
  title = title.replace(/^["'“”‘’《》]+/, "").replace(/["'“”‘’《》]+$/, "");
  // 只取第一行，避免模型输出多行
  title = title.split("\n")[0]?.trim() ?? "";
  // 过长则截断
  if (title.length > MAX_SESSION_TITLE_CHARS) {
    title = title.slice(0, MAX_SESSION_TITLE_CHARS);
  }
  return title.trim();
}

/**
 * 异步生成并保存会话标题
 * - 触发时机：用户消息数恰好为 2 或 5
 * - 注意：不要阻塞主流程；失败只打印日志（MVP）
 */
async function generateAndSaveSessionTitle({
  sessionId,
  history,
}: {
  sessionId: string;
  history: AnyUIMessage[];
}) {
  try {
    // 如果用户已经手动重命名过标题，则跳过 AI 自动生成（避免覆盖用户意图）
    // 注意：当前 Prisma Client 可能尚未重新生成类型，这里用 any 读取新字段（MVP）。
    const session = await (prisma.chatSession as any).findUnique({
      where: { id: sessionId },
      select: { isUserRename: true },
    });
    if (session?.isUserRename) return;

    // 只用“用户输入”生成标题
    const userText = history
      .filter((m) => m.role === "user")
      .map((m) => extractUserText(m))
      .filter(Boolean)
      .slice(-10) // 取最近 10 条，避免过长
      .join("\n\n");

    if (!userText) return;

    // 与 SSE 使用同一模型，避免多模型配置（MVP）
    const result = await generateText({
      model: deepseek("deepseek-chat"),
      system:
        "你是一个对话标题生成器。请根据用户输入总结一个简短标题。只输出标题文本，不要加引号、不要加前后缀。",
      prompt: [
        "标题要求：",
        "- 尽量精炼，中文优先",
        `- 最长不超过 ${MAX_SESSION_TITLE_CHARS} 个字符`,
        "- 不要换行",
        "",
        "用户输入：",
        userText.slice(0, 6000), // 限长，避免 prompt 过大
      ].join("\n"),
      maxOutputTokens: 64,
    });

    const title = normalizeTitle(result.text);
    if (!title) return;

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title },
    });
  } catch (err) {
    console.warn("[chat] generate session title failed", { sessionId, err });
  }
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
  if (DEBUG_AI_STREAM && incomingMessage) {
    const parts = normalizeParts(incomingMessage);
    const summary = summarizeParts(parts as any[]);
    const total = summary.reduce((acc, p) => acc + (p.size > 0 ? p.size : 0), 0);
    const large = summary.filter((p) => p.size >= 50_000).slice(0, 10);
    if (total >= 200_000 || large.length > 0) {
      console.warn("[debug][ai-stream] incomingMessage size warning", {
        sessionId,
        messageId: incomingMessage.id,
        role: incomingMessage.role,
        partsCount: summary.length,
        approxPartsChars: total,
        metaChars: safeJsonSize((incomingMessage as any).metadata),
        largeParts: large,
      });
    }
  }

  // 用同一事务保证：追加/读取的顺序一致，previousMessageId 稳定。
  const history = await prisma.$transaction(async (tx) => {
    // MVP：确保 session 存在（title 等字段使用 Prisma 默认值）。
    await tx.chatSession.upsert({
      where: { id: sessionId },
      update: {},
      create: { id: sessionId },
    });

    if (incomingMessage) {
      // messageId 必须由应用侧提供（与 DB 主键一致）
      if (!incomingMessage.id) {
        throw new Error("incomingMessage.id is required.");
      }

      // 关键：幂等写入，避免断线重试/重复 onFinish 导致重复消息
      const existing = await tx.chatMessage.findUnique({
        where: { id: incomingMessage.id },
        select: { id: true },
      });
      if (existing) {
        // 已保存过：直接走读取历史流程
      } else {
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
            id: incomingMessage.id,
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

        // 如果是第一条消息（previous 为空）且是用户消息，直接提取文本作为标题
        if (!previous && role === MessageRoleEnum.USER) {
          const userText = extractUserText(incomingMessage);
          if (userText) {
            const title = normalizeTitle(userText);
            if (title) {
              await tx.chatSession.update({
                where: { id: sessionId },
                data: { title },
              });
            }
          }
        }
      }
    }

    // 读取全量历史（升序），还原为 AI SDK v6 UIMessage[] 供 agent 使用。
    const history = await tx.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      include: { parts: { orderBy: { index: "asc" } } },
    });

    return history
      .map((message) => {
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
      })
      .filter((message) => message.parts.length > 0);
  });

  // 保存完成后：如果“用户输入”条数恰好为 2 或 5，则异步生成标题（不阻塞主流程）
  if (incomingMessage?.role === "user") {
    const userCount = history.reduce(
      (acc, m) => acc + (m.role === "user" ? 1 : 0),
      0
    );
    if (userCount === 2 || userCount === 5) {
      // fire-and-forget：失败不影响聊天
      void generateAndSaveSessionTitle({ sessionId, history });
    }
  }

  if (DEBUG_AI_STREAM) {
    const sizes = history.map((m) => ({
      id: m.id,
      role: m.role,
      partsCount: Array.isArray((m as any).parts) ? (m as any).parts.length : 0,
      approxChars: safeJsonSize(m),
    }));
    const total = sizes.reduce((acc, s) => acc + (s.approxChars > 0 ? s.approxChars : 0), 0);
    const top = [...sizes].sort((a, b) => b.approxChars - a.approxChars).slice(0, 5);
    if (total >= 500_000) {
      console.warn("[debug][ai-stream] history size warning", {
        sessionId,
        messageCount: history.length,
        approxTotalChars: total,
        topMessages: top,
      });
    }
  }

  return history;
}
