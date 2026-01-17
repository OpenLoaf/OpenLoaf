import path from "node:path";
import { promises as fs } from "node:fs";
import { getProjectRootUri, resolveFilePathFromUri } from "./vfsService";

export type ProjectChatDbClient = {
  /** Delete chat sessions. */
  chatSession: {
    /** Count chat sessions. */
    count: (args: { where: { projectId: string; deletedAt?: Date | null } }) => Promise<number>;
    /** Delete chat sessions. */
    deleteMany: (args: { where: { projectId: string } }) => Promise<{ count: number }>;
  };
  /** Delete chat messages. */
  chatMessage: {
    /** Delete chat messages. */
    deleteMany: (args: { where: { session: { projectId: string } } }) => Promise<{ count: number }>;
  };
  /** Run a transaction. */
  $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
};

export type ProjectChatStats = {
  /** Active session count. */
  sessionCount: number;
};

export type ClearProjectChatResult = {
  /** Number of deleted sessions. */
  deletedSessions: number;
  /** Number of deleted messages. */
  deletedMessages: number;
};

/** Resolve project chat folder path. */
function resolveProjectChatPath(projectId: string): string {
  const rootUri = getProjectRootUri(projectId);
  if (!rootUri) {
    throw new Error("项目不存在");
  }
  const rootPath = resolveFilePathFromUri(rootUri);
  return path.join(rootPath, ".tenas", "chat");
}

/** Get chat stats for a single project. */
export async function getProjectChatStats(
  prisma: ProjectChatDbClient,
  projectId: string,
): Promise<ProjectChatStats> {
  const trimmedId = projectId.trim();
  if (!trimmedId) {
    throw new Error("项目 ID 不能为空");
  }
  // 逻辑：仅统计未删除会话数量。
  const sessionCount = await prisma.chatSession.count({
    where: { projectId: trimmedId, deletedAt: null },
  });
  return { sessionCount };
}

/** Clear chat data for a single project. */
export async function clearProjectChatData(
  prisma: ProjectChatDbClient,
  projectId: string,
): Promise<ClearProjectChatResult> {
  const trimmedId = projectId.trim();
  if (!trimmedId) {
    throw new Error("项目 ID 不能为空");
  }

  const chatPath = resolveProjectChatPath(trimmedId);
  // 逻辑：先清理本地聊天附件目录，再删除数据库记录。
  await fs.rm(chatPath, { recursive: true, force: true });

  const [messages, sessions] = await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { session: { projectId: trimmedId } } }),
    prisma.chatSession.deleteMany({ where: { projectId: trimmedId } }),
  ]);

  return {
    deletedSessions: sessions.count,
    deletedMessages: messages.count,
  };
}
