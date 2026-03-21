/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createBoardId } from "@openloaf/api/common/boardId";
import {
  buildBoardFolderUri,
  resolveBoardScopedRoot,
} from "@openloaf/api/common/boardPaths";
import { getProjectRootPath } from "@openloaf/api/services/vfsService";
import { prisma } from "@openloaf/db";
import { getOpenLoafRootDir } from "@openloaf/config";
import {
  appendMessage,
  getMessageCount,
  loadMessageTree,
  registerSessionDir,
  resolveMessagesJsonlPath,
  type StoredMessage,
  writeSessionJson,
} from "@/ai/services/chat/repositories/chatFileStore";

type PrismaClientLike = typeof prisma;

type CopySessionToBoardInput = {
  /** Source chat session id. */
  sourceSessionId: string;
  /** Existing board id for import. */
  targetBoardId?: string;
  /** Prisma client from request context. */
  prisma: PrismaClientLike;
};

type ImportedChatMessage = {
  /** Imported message id in the target session. */
  id: string;
  /** Imported parent message id in the target session. */
  parentMessageId: string | null;
  /** Imported role. */
  role: StoredMessage["role"];
  /** Imported parts payload. */
  parts: unknown[];
  /** Imported metadata payload. */
  metadata?: Record<string, unknown>;
  /** Imported message kind. */
  messageKind: StoredMessage["messageKind"];
  /** Imported creation timestamp. */
  createdAt: string;
};

export type CopySessionToBoardResult = {
  /** Target board metadata. */
  board: {
    id: string;
    title: string;
    folderUri: string;
    projectId: string | null;
  };
  /** Target session id (always equals board id). */
  targetSessionId: string;
  /** Whether this call created a new board. */
  createdBoard: boolean;
  /** Import batch id used for copied resources. */
  importBatchId: string;
  /** Number of imported messages. */
  importedMessageCount: number;
  /** Number of copied files. */
  copiedFileCount: number;
  /** Imported messages in chronological order. */
  importedMessages: ImportedChatMessage[];
};

type SessionRow = {
  /** Session id. */
  id: string;
  /** Session title. */
  title: string;
  /** Bound project id. */
  projectId: string | null;
  /** Bound board id. */
  boardId: string | null;
  /** Session preface content. */
  sessionPreface: string | null;
  /** Pin flag. */
  isPin: boolean;
  /** Rename flag. */
  isUserRename: boolean;
  /** Error message. */
  errorMessage: string | null;
  /** CLI id binding. */
  cliId: string | null;
  /** Deletion timestamp. */
  deletedAt: Date | null;
  /** Creation time. */
  createdAt: Date;
  /** Update time. */
  updatedAt: Date;
  /** Stored message count. */
  messageCount: number;
};

type CopyContext = {
  /** Source session row. */
  sourceSession: SessionRow;
  /** Target board metadata. */
  board: {
    id: string;
    title: string;
    folderUri: string;
    projectId: string | null;
  };
  /** Source storage root path. */
  sourceScopeRootPath: string;
  /** Target storage root path. */
  targetScopeRootPath: string;
  /** Source session directory. */
  sourceSessionDir: string;
  /** Target session directory. */
  targetSessionDir: string;
  /** Import batch id. */
  importBatchId: string;
  /** Whether the target board was newly created. */
  createdBoard: boolean;
  /** Whether imported resources should keep direct layout. */
  directResourceLayout: boolean;
  /** Whether target message ids can be preserved. */
  preserveMessageIds: boolean;
  /** Existing target message count before import. */
  existingTargetMessageCount: number;
};

type ImportPreparation = {
  /** Path replacements used for message/metadata rewrite. */
  replacementMap: Map<string, string>;
  /** Copied file count. */
  copiedFileCount: number;
};

const IMPORT_SIDECAR_FILES = ["PROMPT.md", "PREFACE.md", "system.json"] as const;

/** Copy a chat session into a board-backed session. */
export async function copySessionToBoard(
  input: CopySessionToBoardInput,
): Promise<CopySessionToBoardResult> {
  const sourceSessionId = input.sourceSessionId.trim();
  if (!sourceSessionId) {
    throw new Error("sourceSessionId is required.");
  }

  const sourceSession = await input.prisma.chatSession.findUnique({
    where: { id: sourceSessionId },
    select: {
      id: true,
      title: true,
      projectId: true,
      boardId: true,
      sessionPreface: true,
      isPin: true,
      isUserRename: true,
      errorMessage: true,
      cliId: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      messageCount: true,
    },
  });
  if (!sourceSession || sourceSession.deletedAt) {
    throw new Error("Chat session not found.");
  }

  const board = await ensureTargetBoard({
    prisma: input.prisma,
    sourceSession,
    targetBoardId: input.targetBoardId,
  });
  const targetSessionId = board.id;
  await registerSessionDir(targetSessionId, board.projectId, board.id);

  const sourceScopeRootPath = resolveScopeRootPath(sourceSession.projectId);
  const targetScopeRootPath = resolveScopeRootPath(board.projectId);
  const sourceSessionDir = path.dirname(await resolveMessagesJsonlPath(sourceSessionId));
  const targetSessionDir = path.dirname(await resolveMessagesJsonlPath(targetSessionId));
  const sourceTree = await loadMessageTree(sourceSessionId);
  const targetTree = await loadMessageTree(targetSessionId);
  const importBatchId = buildImportBatchId();

  const copyContext: CopyContext = {
    sourceSession,
    board,
    sourceScopeRootPath,
    targetScopeRootPath,
    sourceSessionDir,
    targetSessionDir,
    importBatchId,
    createdBoard: board.createdBoard,
    // 逻辑：新建画布时保留 asset/root 原始结构，便于后续 board session 直接复用。
    directResourceLayout: board.createdBoard && targetTree.byId.size === 0,
    // 逻辑：空目标会话无需重写 messageId，非空导入才需要避免冲突。
    preserveMessageIds: targetTree.byId.size === 0,
    existingTargetMessageCount: targetTree.byId.size,
  };

  await ensureTargetSession({
    prisma: input.prisma,
    board: copyContext.board,
    sourceSession,
  });

  const preparation = await prepareSessionImport(copyContext);
  const importedMessages = buildImportedMessages({
    sourceMessages: sortStoredMessages(Array.from(sourceTree.byId.values())),
    sourceTree,
    replacementMap: preparation.replacementMap,
    preserveMessageIds: copyContext.preserveMessageIds,
    sourceSessionId,
    importBatchId,
  });

  for (const message of importedMessages) {
    await appendMessage({
      sessionId: targetSessionId,
      message: {
        id: message.id,
        parentMessageId: message.parentMessageId,
        role: message.role,
        messageKind: message.messageKind,
        parts: message.parts,
        metadata: message.metadata,
        createdAt: message.createdAt,
      },
    });
  }

  const nextMessageCount = await getMessageCount(targetSessionId);
  await input.prisma.chatSession.update({
    where: { id: targetSessionId },
    data: {
      boardId: copyContext.board.id,
      projectId: copyContext.board.projectId,
      title: copyContext.board.title,
      deletedAt: null,
      messageCount: nextMessageCount,
      ...(copyContext.createdBoard && sourceSession.sessionPreface
        ? { sessionPreface: sourceSession.sessionPreface }
        : {}),
    },
  });

  await writeSessionJson(targetSessionId, {
    id: targetSessionId,
    title: copyContext.board.title,
    isUserRename: false,
    isPin: false,
    errorMessage: null,
    sessionPreface:
      copyContext.createdBoard && sourceSession.sessionPreface
        ? sourceSession.sessionPreface
        : undefined,
    projectId: copyContext.board.projectId,
    boardId: copyContext.board.id,
    cliId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    messageCount: nextMessageCount,
  });

  return {
    board: {
      id: copyContext.board.id,
      title: copyContext.board.title,
      folderUri: copyContext.board.folderUri,
      projectId: copyContext.board.projectId,
    },
    targetSessionId,
    createdBoard: copyContext.createdBoard,
    importBatchId,
    importedMessageCount: importedMessages.length,
    copiedFileCount: preparation.copiedFileCount,
    importedMessages,
  };
}

/** Ensure the target board exists, creating a new board when needed. */
async function ensureTargetBoard(input: {
  prisma: PrismaClientLike;
  sourceSession: SessionRow;
  targetBoardId?: string;
}): Promise<{
  id: string;
  title: string;
  folderUri: string;
  projectId: string | null;
  createdBoard: boolean;
}> {
  const targetBoardId = input.targetBoardId?.trim();
  if (targetBoardId) {
    const board = await input.prisma.board.findUnique({
      where: { id: targetBoardId },
      select: { id: true, title: true, folderUri: true, projectId: true, deletedAt: true },
    });
    if (!board || board.deletedAt) {
      throw new Error("Board not found.");
    }
    return {
      id: board.id,
      title: board.title,
      folderUri: board.folderUri,
      projectId: board.projectId,
      createdBoard: false,
    };
  }

  const boardId = createBoardId();
  const title = normalizeBoardTitle(input.sourceSession.title);
  const rootPath = resolveBoardScopedRoot(input.sourceSession.projectId ?? undefined);
  const folderUri = buildBoardFolderUri(rootPath, boardId);
  const board = await input.prisma.board.create({
    data: {
      id: boardId,
      title,
      projectId: input.sourceSession.projectId,
      folderUri,
    },
    select: {
      id: true,
      title: true,
      folderUri: true,
      projectId: true,
    },
  });
  return {
    ...board,
    createdBoard: true,
  };
}

/** Ensure the target board chat session exists. */
async function ensureTargetSession(input: {
  prisma: PrismaClientLike;
  board: { id: string; title: string; projectId: string | null };
  sourceSession: SessionRow;
}): Promise<void> {
  await input.prisma.chatSession.upsert({
    where: { id: input.board.id },
    update: {
      boardId: input.board.id,
      projectId: input.board.projectId,
      title: input.board.title,
      deletedAt: null,
    },
    create: {
      id: input.board.id,
      boardId: input.board.id,
      projectId: input.board.projectId,
      title: input.board.title,
      sessionPreface: input.sourceSession.sessionPreface,
    },
  });
}

/** Prepare copied files and string replacement maps for import. */
async function prepareSessionImport(input: CopyContext): Promise<ImportPreparation> {
  await fs.mkdir(input.targetSessionDir, { recursive: true });
  const replacementMap = new Map<string, string>();
  let copiedFileCount = 0;

  // 逻辑：主资源目录统一复制并重写路径，避免新 board session 继续依赖旧 chat 目录。
  for (const dirName of ["asset", "root", "files"] as const) {
    const sourceDir = path.join(input.sourceSessionDir, dirName);
    if (!(await directoryExists(sourceDir))) continue;

    const targetDir = input.directResourceLayout
      ? path.join(input.targetSessionDir, dirName)
      : path.join(input.targetSessionDir, dirName, "chat-imports", input.importBatchId);
    const copied = await copyDirectoryWithMapping({
      sourceDir,
      targetDir,
      sourceScopeRootPath: input.sourceScopeRootPath,
      targetScopeRootPath: input.targetScopeRootPath,
      replacementMap,
    });
    copiedFileCount += copied;
  }

  const copiedAgents = await copyAgentDirectories({
    sourceAgentsDir: path.join(input.sourceSessionDir, "agents"),
    targetAgentsDir: path.join(input.targetSessionDir, "agents"),
    preserveAgentIds: input.preserveMessageIds,
    importBatchId: input.importBatchId,
    replacementMap,
  });
  copiedFileCount += copiedAgents;

  // 逻辑：仅在新建 board 时复制 session 级辅助文件，避免覆盖已有 board 会话的调试元信息。
  if (input.createdBoard) {
    for (const fileName of IMPORT_SIDECAR_FILES) {
      const sourcePath = path.join(input.sourceSessionDir, fileName);
      if (!(await fileExists(sourcePath))) continue;
      const targetPath = path.join(input.targetSessionDir, fileName);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      copiedFileCount += 1;
    }
  }

  return { replacementMap, copiedFileCount };
}

/** Copy resource files and record path replacements. */
async function copyDirectoryWithMapping(input: {
  sourceDir: string;
  targetDir: string;
  sourceScopeRootPath: string;
  targetScopeRootPath: string;
  replacementMap: Map<string, string>;
}): Promise<number> {
  const files = await collectFiles(input.sourceDir);
  let copied = 0;
  for (const sourcePath of files) {
    const relativeInsideDir = path.relative(input.sourceDir, sourcePath);
    const targetPath = path.join(input.targetDir, relativeInsideDir);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    copied += 1;

    const sourceRelativePath = toPosixPath(
      path.relative(input.sourceScopeRootPath, sourcePath),
    );
    const targetRelativePath = toPosixPath(
      path.relative(input.targetScopeRootPath, targetPath),
    );
    const sourceFileUri = toFileUri(sourcePath);
    input.replacementMap.set(sourceRelativePath, targetRelativePath);
    input.replacementMap.set(sourcePath, targetRelativePath);
    input.replacementMap.set(sourceFileUri, targetRelativePath);
    // 逻辑：旧 mention 文本常包在 @{...} 中，这里预先登记包装形式以减少字符串重写歧义。
    input.replacementMap.set(`@{${sourceRelativePath}}`, `@{${targetRelativePath}}`);
    input.replacementMap.set(`@{${sourcePath}}`, `@{${targetRelativePath}}`);
    input.replacementMap.set(`@{${sourceFileUri}}`, `@{${targetRelativePath}}`);
  }
  return copied;
}

/** Copy agent directories and rewrite their ids when needed. */
async function copyAgentDirectories(input: {
  sourceAgentsDir: string;
  targetAgentsDir: string;
  preserveAgentIds: boolean;
  importBatchId: string;
  replacementMap: Map<string, string>;
}): Promise<number> {
  if (!(await directoryExists(input.sourceAgentsDir))) return 0;
  const entries = await fs.readdir(input.sourceAgentsDir, { withFileTypes: true });
  let copied = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceAgentId = entry.name;
    const targetAgentId = input.preserveAgentIds
      ? sourceAgentId
      : `${sourceAgentId}_${input.importBatchId.slice(0, 8)}`;
    const sourceAgentDir = path.join(input.sourceAgentsDir, sourceAgentId);
    const targetAgentDir = path.join(input.targetAgentsDir, targetAgentId);
    await fs.mkdir(path.dirname(targetAgentDir), { recursive: true });
    await fs.cp(sourceAgentDir, targetAgentDir, { recursive: true });
    copied += await countFiles(targetAgentDir);
    input.replacementMap.set(sourceAgentId, targetAgentId);

    const targetSessionJsonPath = path.join(targetAgentDir, "session.json");
    if (await fileExists(targetSessionJsonPath)) {
      try {
        const raw = await fs.readFile(targetSessionJsonPath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        await fs.writeFile(
          targetSessionJsonPath,
          JSON.stringify({ ...parsed, id: targetAgentId }, null, 2),
          "utf8",
        );
      } catch {
        // 逻辑：agent 元信息损坏不应阻断主流程，保留已复制目录供后续修复。
      }
    }
  }

  return copied;
}

/** Build imported messages with rewritten ids and payload references. */
function buildImportedMessages(input: {
  sourceMessages: StoredMessage[];
  sourceTree: Awaited<ReturnType<typeof loadMessageTree>>;
  replacementMap: Map<string, string>;
  preserveMessageIds: boolean;
  sourceSessionId: string;
  importBatchId: string;
}): ImportedChatMessage[] {
  const idMap = new Map<string, string>();
  for (const message of input.sourceMessages) {
    idMap.set(
      message.id,
      input.preserveMessageIds ? message.id : randomUUID(),
    );
  }

  return input.sourceMessages.map((message) => {
    const nextId = idMap.get(message.id) ?? message.id;
    const nextParentMessageId = message.parentMessageId
      ? idMap.get(message.parentMessageId) ?? null
      : null;
    const rewrittenParts = rewriteImportedValue(message.parts, input.replacementMap);
    const rewrittenMetadata = rewriteImportedValue(
      (message.metadata as Record<string, unknown> | undefined) ?? {},
      input.replacementMap,
    ) as Record<string, unknown>;
    return {
      id: nextId,
      parentMessageId: nextParentMessageId,
      role: message.role,
      messageKind: message.messageKind ?? "normal",
      parts: Array.isArray(rewrittenParts) ? rewrittenParts : [],
      metadata: {
        ...rewrittenMetadata,
        importedFromSessionId: input.sourceSessionId,
        importedFromMessageId: message.id,
        importBatchId: input.importBatchId,
      },
      createdAt: message.createdAt,
    };
  });
}

/** Rewrite arbitrary JSON-like payload with copied path replacements. */
function rewriteImportedValue(value: unknown, replacementMap: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteImportedValue(item, replacementMap));
  }
  if (typeof value === "string") {
    return rewriteImportedString(value, replacementMap);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
    key,
    rewriteImportedValue(entryValue, replacementMap),
  ]);
  return Object.fromEntries(entries);
}

/** Rewrite a string payload with copied path replacements. */
function rewriteImportedString(value: string, replacementMap: Map<string, string>): string {
  let nextValue = value;
  for (const [sourceValue, targetValue] of replacementMap.entries()) {
    if (!sourceValue || sourceValue === targetValue) continue;
    if (!nextValue.includes(sourceValue)) continue;
    nextValue = nextValue.split(sourceValue).join(targetValue);
  }
  return nextValue;
}

/** Collect every file path under a directory. */
async function collectFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

/** Count files under a directory recursively. */
async function countFiles(rootDir: string): Promise<number> {
  return (await collectFiles(rootDir)).length;
}

/** Return true when a file exists. */
async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/** Return true when a directory exists. */
async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Resolve the storage root for a project or global scope. */
function resolveScopeRootPath(projectId: string | null): string {
  const trimmedProjectId = projectId?.trim();
  if (trimmedProjectId) {
    const rootPath = getProjectRootPath(trimmedProjectId);
    if (rootPath) return rootPath;
  }
  return getOpenLoafRootDir();
}

/** Normalize a board title from the source session. */
function normalizeBoardTitle(rawTitle: string): string {
  const trimmed = rawTitle.trim();
  return trimmed || "新画布";
}

/** Build a stable import batch id. */
function buildImportBatchId(): string {
  return `${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

/** Convert a path to POSIX separators. */
function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

/** Convert a local path to file:// URI without encoding. */
function toFileUri(targetPath: string): string {
  const normalized = path.resolve(targetPath);
  if (normalized.startsWith("/")) return `file://${normalized}`;
  return `file:///${normalized.replace(/\\/g, "/")}`;
}

/** Sort stored messages by created time and id. */
function sortStoredMessages(messages: StoredMessage[]): StoredMessage[] {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}
