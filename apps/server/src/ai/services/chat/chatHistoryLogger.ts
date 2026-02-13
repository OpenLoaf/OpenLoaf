import { promises as fs } from "node:fs";
import path from "node:path";
import type { UIMessage } from "ai";
import { getWorkspaceRootPath, getWorkspaceRootPathById } from "@tenas-ai/api/services/vfsService";
import { prisma } from "@tenas-ai/db";
import { resolveMessagePathById } from "@/ai/services/chat/repositories/messageStore";
import { resolveBranchKeyFromLeafPath } from "@/ai/services/chat/repositories/messageBranchResolver";
import { logger } from "@/common/logger";

/** Chat branch context payload for development diagnostics. */
type ChatBranchContextLogInput = {
  /** Chat session id. */
  sessionId: string;
  /** Workspace id for resolving root path. */
  workspaceId?: string;
  /** Leaf message id for path lookup. */
  leafMessageId: string;
  /** Model-ready messages that are sent to llm. */
  modelMessages: UIMessage[];
};

/** Directory name for chat history snapshots. */
const CHAT_HISTORY_DIR = path.join(".tenas", "chat_history");

/** Check whether the server runs in development mode. */
function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Convert a message path into a safe file name. */
function formatMessagePathFileName(value: string): string {
  return value.replace(/[\\/]/g, "_");
}

/** Persist full llm context log for the current branch to workspace .tenas/chat_history. */
export async function persistChatBranchContextLog(input: ChatBranchContextLogInput): Promise<void> {
  if (!isDevelopment()) return;
  try {
    const leafMessageId = String(input.leafMessageId ?? "").trim();
    if (!leafMessageId) return;
    const workspaceRoot = input.workspaceId
      ? getWorkspaceRootPathById(input.workspaceId)
      : getWorkspaceRootPath();
    if (!workspaceRoot) return;

    const messagePath = await resolveMessagePathById({
      sessionId: input.sessionId,
      messageId: leafMessageId,
    });
    if (!messagePath) return;
    const branchKeyPath = await resolveBranchKeyFromLeafPath(
      prisma,
      { sessionId: input.sessionId, leafMessagePath: messagePath },
    );
    const resolvedBranchKeyPath = branchKeyPath ?? messagePath;

    // 目录以 sessionId 命名，避免时间戳导致路径过长或不稳定。
    const dirPath = path.join(workspaceRoot, CHAT_HISTORY_DIR, input.sessionId);
    // 确保输出目录存在，避免并发写入时报错。
    await fs.mkdir(dirPath, { recursive: true });

    const fileName = `${formatMessagePathFileName(resolvedBranchKeyPath)}.jsonl`;
    const filePath = path.join(dirPath, fileName);
    // 逻辑：同一支路始终覆盖写，确保文件内容总是“当前发送给 LLM 的完整上下文”。
    const lines = input.modelMessages.map((message) => `${JSON.stringify(message)}\n`).join("");
    await fs.writeFile(filePath, lines, "utf8");
  } catch (err) {
    logger.warn({ err, sessionId: input.sessionId }, "[chat] persist branch context log failed");
  }
}

/** Resolve current branch jsonl path from leaf message id. */
export async function resolveBranchJsonlPathFromLeafMessage(input: {
  /** Chat session id. */
  sessionId: string;
  /** Workspace id for resolving root path. */
  workspaceId?: string | null;
  /** Leaf message id for path lookup. */
  leafMessageId: string;
  /** Chat message read model. */
  prismaReader: {
    chatMessage: {
      findMany: (args: any) => Promise<any[]>;
    };
  };
}): Promise<string | null> {
  const workspaceId = String(input.workspaceId ?? "").trim();
  const leafMessageId = String(input.leafMessageId ?? "").trim();
  if (!leafMessageId) return null;
  const workspaceRoot = workspaceId ? getWorkspaceRootPathById(workspaceId) : getWorkspaceRootPath();
  if (!workspaceRoot) return null;

  const messagePath = await resolveMessagePathById({
    sessionId: input.sessionId,
    messageId: leafMessageId,
  });
  if (!messagePath) return null;
  const branchKeyPath =
    (await resolveBranchKeyFromLeafPath(input.prismaReader, {
      sessionId: input.sessionId,
      leafMessagePath: messagePath,
    })) ?? messagePath;
  const fileName = `${formatMessagePathFileName(branchKeyPath)}.jsonl`;
  return path.join(workspaceRoot, CHAT_HISTORY_DIR, input.sessionId, fileName);
}
