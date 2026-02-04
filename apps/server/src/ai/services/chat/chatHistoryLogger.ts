import { promises as fs } from "node:fs";
import path from "node:path";
import type { UIMessage } from "ai";
import { getWorkspaceRootPath, getWorkspaceRootPathById } from "@tenas-ai/api/services/vfsService";
import type { ChatStreamRequest } from "@/ai/services/chat/types";
import { resolveMessagePathById } from "@/ai/services/chat/repositories/messageStore";
import { logger } from "@/common/logger";

/** Chat request snapshot payload for development diagnostics. */
type ChatRequestSnapshotInput = {
  /** Chat session id. */
  sessionId: string;
  /** Workspace id for resolving root path. */
  workspaceId?: string;
  /** Request timestamp. */
  requestStartAt: Date;
  /** Leaf message id for path lookup. */
  leafMessageId: string;
  /** Raw chat request payload. */
  request: ChatStreamRequest;
  /** Model-ready messages with preface and history. */
  modelMessages: UIMessage[];
  /** System prompt used by the master agent. */
  systemPrompt?: string;
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

/** Persist full chat request snapshot to workspace .tenas/chat_history. */
export async function persistChatRequestSnapshot(input: ChatRequestSnapshotInput): Promise<void> {
  if (!isDevelopment()) return;
  try {
    const workspaceRoot = input.workspaceId
      ? getWorkspaceRootPathById(input.workspaceId)
      : getWorkspaceRootPath();
    if (!workspaceRoot) return;

    const messagePath = await resolveMessagePathById({
      sessionId: input.sessionId,
      messageId: input.leafMessageId,
    });
    if (!messagePath) return;

    // 中文注释：目录以 sessionId 命名，避免时间戳导致路径过长或不稳定。
    const dirPath = path.join(workspaceRoot, CHAT_HISTORY_DIR, input.sessionId);
    // 中文注释：确保输出目录存在，避免并发写入时报错。
    await fs.mkdir(dirPath, { recursive: true });

    const fileName = `${formatMessagePathFileName(messagePath)}.jsonl`;
    const filePath = path.join(dirPath, fileName);
    // 中文注释：每次请求追加一行，便于同一路径多次请求对比。
    const record = {
      timestamp: input.requestStartAt.toISOString(),
      sessionId: input.sessionId,
      messagePath,
      workspaceId: input.workspaceId ?? null,
      request: input.request,
      systemPrompt: input.systemPrompt ?? null,
      modelMessages: input.modelMessages,
    };
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    logger.warn({ err, sessionId: input.sessionId }, "[chat] persist request snapshot failed");
  }
}
