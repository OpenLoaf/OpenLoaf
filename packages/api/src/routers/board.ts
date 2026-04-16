/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { getOpenLoafRootDir } from "@openloaf/config";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import { createBoardId } from "../common/boardId";
import {
  BOARD_ASSET_DIR,
  BOARD_FOLDER_PREFIX,
  BOARD_FOLDER_PREFIX_LEGACY,
  buildBoardFolderUri,
  resolveBoardAbsPath,
  resolveBoardDir,
  resolveBoardEntityId,
  resolveBoardFolderName,
  resolveBoardRootPath,
  resolveBoardScopedRoot,
  resolveBoardsBaseDir,
} from "../common/boardPaths";
import { recordEntityVisit } from "../services/entityVisitRecordService";
import { getResolvedTempStorageDir } from "../services/appConfigService";

const BOARD_THUMBNAIL_FILE_NAME = "index.png";
const BOARD_THUMBNAIL_WIDTH = 280;
const BOARD_THUMBNAIL_QUALITY = 60;

const DEFAULT_BOARD_LIST_PAGE_SIZE = 30;
const MAX_BOARD_LIST_PAGE_SIZE = 120;

type BoardListItem = {
  id: string;
  title: string;
  isPin: boolean;
  projectId: string | null;
  folderUri: string;
  createdAt: Date;
  updatedAt: Date;
};

type BoardListPage = {
  items: BoardListItem[];
  total: number;
  cursor: string | null;
  nextCursor: string | null;
  pageSize: number;
  hasMore: boolean;
};

const boardListSelect = {
  id: true,
  title: true,
  isPin: true,
  colorIndex: true,
  projectId: true,
  folderUri: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Normalize board page size into a safe bounded integer. */
function normalizeBoardListPageSize(pageSize?: number | null): number {
  if (!pageSize || Number.isNaN(pageSize)) return DEFAULT_BOARD_LIST_PAGE_SIZE;
  const normalized = Math.floor(pageSize);
  if (normalized < 1) return DEFAULT_BOARD_LIST_PAGE_SIZE;
  return Math.min(normalized, MAX_BOARD_LIST_PAGE_SIZE);
}

/** Decode offset cursor for paginated board list queries. */
function decodeBoardListCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  const offset = Number.parseInt(cursor, 10);
  if (Number.isNaN(offset) || offset < 0) return 0;
  return offset;
}

/** Build the Prisma where clause used by board list pages. */
function buildBoardListWhere(input: {
  projectId?: string;
  filterProjectId?: string | null;
  unboundOnly?: boolean;
  search?: string | null;
}) {
  const scopeProjectId = input.projectId?.trim();
  const filterProjectId = input.filterProjectId?.trim() || null;
  const search = input.search?.trim();

  const where: Record<string, unknown> = {
    deletedAt: null,
  };

  if (scopeProjectId) {
    where.projectId = scopeProjectId;
  } else if (input.unboundOnly) {
    where.projectId = null;
  } else if (filterProjectId) {
    where.projectId = filterProjectId;
  }

  if (search) {
    where.title = {
      contains: search,
    };
  }

  return where;
}

/** Query a paginated board list with server-side search and filtering. */
async function listBoardListPage(
  prisma: any,
  input: {
    cursor?: string | null;
    pageSize?: number | null;
    projectId?: string;
    filterProjectId?: string | null;
    unboundOnly?: boolean;
    search?: string | null;
  },
): Promise<BoardListPage> {
  const cursor = input.cursor?.trim() || null;
  const pageSize = normalizeBoardListPageSize(input.pageSize);
  const where = buildBoardListWhere(input);
  const offset = decodeBoardListCursor(cursor);

  const queryPage = async () => {
    const total = await prisma.board.count({ where });
    const boundedOffset = Math.min(offset, total);
    const items = await prisma.board.findMany({
      where,
      orderBy: [{ isPin: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: boundedOffset,
      take: pageSize,
      select: boardListSelect,
    });
    const nextOffset = boundedOffset + items.length;
    const hasMore = nextOffset < total;
    return {
      items,
      total,
      cursor,
      nextCursor: hasMore ? String(nextOffset) : null,
      pageSize,
      hasMore,
    };
  };

  let page = await queryPage();
  if (page.total === 0 && offset === 0 && !input.search?.trim()) {
    try {
      await syncBoardsFromDisk(prisma, {
        projectId: input.projectId ?? input.filterProjectId ?? undefined,
      });
      page = await queryPage();
    } catch (error) {
      console.warn("[board.listPaged] sync from disk failed", error);
    }
  }

  return page;
}

/** Extract a display title from a board folder name. */
function extractBoardTitle(folderName: string): string {
  if (folderName.startsWith(BOARD_FOLDER_PREFIX_LEGACY)) {
    // tnboard_电商 → 电商, tnboard_智能画布_XPZK → 智能画布_XPZK
    return folderName.slice(BOARD_FOLDER_PREFIX_LEGACY.length) || "画布";
  }
  // board_1772791815911 or board_20260309_143022_abc → keep as-is (use default)
  return "画布";
}

/**
 * Migrate legacy unbound board folders to the current temp storage layout.
 * Handles two legacy locations:
 * 1. ~/.openloaf/boards/ → {tempDir}/boards/
 * 2. {tempDir}/.openloaf/boards/ → {tempDir}/boards/
 * Runs once per process.
 */
let _legacyBoardsMigrated = false;
async function migrateLegacyUnboundBoards(): Promise<void> {
  if (_legacyBoardsMigrated) return;
  _legacyBoardsMigrated = true;

  const tempDir = getResolvedTempStorageDir();
  const newDir = resolveBoardDir(tempDir); // {tempDir}/boards/

  // Legacy locations to migrate from
  const legacyDirs = [
    path.join(getOpenLoafRootDir(), "boards"),       // ~/.openloaf/boards/
    path.join(tempDir, ".openloaf", "boards"),        // {tempDir}/.openloaf/boards/
  ];

  for (const legacyDir of legacyDirs) {
    if (path.resolve(legacyDir) === path.resolve(newDir)) continue;
    await migrateBoardFolders(legacyDir, newDir);
  }
}

/** Move board folders from a legacy directory to the new directory. */
async function migrateBoardFolders(legacyDir: string, newDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(legacyDir);
  } catch {
    return; // Legacy dir doesn't exist — nothing to migrate
  }

  const boardFolders = entries.filter(
    (name) =>
      name.startsWith(BOARD_FOLDER_PREFIX) ||
      name.startsWith(BOARD_FOLDER_PREFIX_LEGACY) ||
      name.startsWith("chat_"),
  );
  if (boardFolders.length === 0) return;

  await fs.mkdir(newDir, { recursive: true });

  for (const folder of boardFolders) {
    const src = path.join(legacyDir, folder);
    const dest = path.join(newDir, folder);
    try {
      await fs.access(dest);
      continue; // Destination already exists — skip
    } catch {
      // Destination doesn't exist — safe to move
    }
    try {
      await fs.rename(src, dest);
    } catch {
      try {
        await fs.cp(src, dest, { recursive: true });
        await fs.rm(src, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[migrateLegacyUnboundBoards] failed to move ${folder}:`, err);
      }
    }
  }
}

/**
 * Scan .openloaf/boards/ on disk and create DB records for folders
 * that have no matching record yet. Returns newly synced boards.
 */
async function syncBoardsFromDisk(
  prisma: any,
  input: { projectId?: string },
): Promise<void> {
  // Migrate legacy unbound boards from ~/.openloaf/boards/ to temp storage
  if (!input.projectId) {
    await migrateLegacyUnboundBoards();
  }
  let boardsDir: string;
  let rootPath: string;
  try {
    rootPath = resolveBoardScopedRoot(input.projectId);
    boardsDir = resolveBoardsBaseDir(input.projectId);
  } catch (err) {
    console.warn("[syncBoardsFromDisk] resolveBoardsBaseDir failed:", err);
    return;
  }
  let entries: string[];
  try {
    entries = await fs.readdir(boardsDir);
  } catch (err) {
    console.warn("[syncBoardsFromDisk] readdir failed:", err);
    return;
  }

  // Filter to valid board folder names
  const boardFolders = entries.filter(
    (name) =>
      name.startsWith(BOARD_FOLDER_PREFIX) ||
      name.startsWith(BOARD_FOLDER_PREFIX_LEGACY),
  );
  if (boardFolders.length === 0) return;

  // Verify each is a directory containing board data files.
  const toSync: Array<{ folderName: string; mtime: Date }> = [];
  for (const folderName of boardFolders) {
    try {
      const folderPath = path.join(boardsDir, folderName);
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) continue;
      // Accept any index.tnboard* file (index.tnboard, index.tnboard.json, index.tnboard.meta.json)
      const files = await fs.readdir(folderPath);
      const hasBoardFile = files.some((f) => f.startsWith("index.tnboard"));
      if (!hasBoardFile) continue;
      toSync.push({ folderName, mtime: stat.mtime });
    } catch {
      // Skip invalid entries
    }
  }
  if (toSync.length === 0) return;

  // Check which ones already have DB records (by folderUri — match both old and new format)
  const newFolderUris = toSync.map((b) => buildBoardFolderUri(rootPath, b.folderName));
  const legacyFolderUris = toSync.map((b) => `.openloaf/boards/${b.folderName}/`);
  const existing = await prisma.board.findMany({
    where: {
      folderUri: { in: [...newFolderUris, ...legacyFolderUris] },
    },
    select: { folderUri: true },
  });
  const existingSet = new Set(existing.map((b: any) => b.folderUri));

  // Create missing records
  const newRecords = toSync
    .filter((b) =>
      !existingSet.has(buildBoardFolderUri(rootPath, b.folderName)) &&
      !existingSet.has(`.openloaf/boards/${b.folderName}/`)
    )
    .map((b) => ({
      id: createBoardId(),
      title: extractBoardTitle(b.folderName),
      projectId: input.projectId ?? null,
      folderUri: buildBoardFolderUri(rootPath, b.folderName),
      createdAt: b.mtime,
      updatedAt: b.mtime,
    }));

  if (newRecords.length === 0) return;

  // LibSQL adapter doesn't support skipDuplicates — insert one-by-one
  for (const record of newRecords) {
    try {
      await prisma.board.create({ data: record });
    } catch {
      // Duplicate or constraint error — skip
    }
  }
}

/** Hard-delete a board record, related sessions, and folder. */
async function hardDeleteBoardResources(
  prisma: any,
  board: { id: string; folderUri: string; projectId: string | null },
): Promise<{ deletedSessions: number }> {
  const deletedSessions = await prisma.$transaction(async (tx: any) => {
    const deletedChatResult = await tx.chatSession.deleteMany({
      where: { boardId: board.id },
    });
    await tx.board.delete({
      where: { id: board.id },
    });
    return deletedChatResult.count as number;
  });

  try {
    const rootPath = resolveBoardRootPath(board);
    const boardDir = resolveBoardAbsPath(rootPath, board.folderUri);
    await fs.rm(boardDir, { recursive: true, force: true });
  } catch (error) {
    console.warn("[board.hardDelete] failed to delete folder", error);
  }

  return { deletedSessions };
}

export const boardRouter = t.router({
  /** Create a new board with DB record and file structure. */
  create: shieldedProcedure
    .input(
      z.object({
        projectId: z.string().trim().optional(),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const boardId = createBoardId();
      const rootPath = resolveBoardScopedRoot(input.projectId);
      const folderUri = buildBoardFolderUri(rootPath, boardId);

      const now = new Date();
      const defaultTitle = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const board = await ctx.prisma.board.create({
        data: {
          id: boardId,
          title: input.title ?? defaultTitle,
          projectId: input.projectId ?? null,
          folderUri,
        },
      });

      // 逻辑：在磁盘上预创建画布目录、asset 子目录和 meta 文件，
      // 避免前端打开时 fs.readFile meta 报 NOT_FOUND ERROR 日志。
      try {
        const boardDir = resolveBoardDir(rootPath, boardId);
        await fs.mkdir(path.join(boardDir, BOARD_ASSET_DIR), { recursive: true });
        const docId = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        await fs.writeFile(
          path.join(boardDir, "index.tnboard.meta.json"),
          JSON.stringify({ docId }, null, 2),
          "utf-8",
        );
      } catch {
        // 目录/文件创建失败不阻断画布创建主流程。
      }

      try {
        await recordEntityVisit(ctx.prisma, {
          entityType: "board",
          entityId: resolveBoardEntityId(board.folderUri),
          projectId: board.projectId ?? undefined,
          trigger: "board-create",
          visitedAt: now,
        });
      } catch (error) {
        // 逻辑：进入记录失败不应阻断画布创建主流程。
        console.warn("[board.create] failed to record entity visit", error);
      }

      return board;
    }),

  /** List boards, optionally filtered by project. */
  list: shieldedProcedure
    .input(
      z.object({
        projectId: z.string().trim().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        deletedAt: null,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      };

      let boards = await ctx.prisma.board.findMany({
        where,
        orderBy: [{ isPin: "desc" }, { createdAt: "desc" }],
        select: boardListSelect,
      });

      // If DB has no records for this scope, try syncing from filesystem.
      if (boards.length === 0) {
        try {
          await syncBoardsFromDisk(ctx.prisma, {
            projectId: input.projectId,
          });
          boards = await ctx.prisma.board.findMany({
            where,
            orderBy: [{ isPin: "desc" }, { createdAt: "desc" }],
            select: boardListSelect,
          });
        } catch (error) {
          console.warn("[board.list] sync from disk failed", error);
        }
      }

      // Deduplicate by folderUri — prefer the record whose id matches the folder name
      const seen = new Map<string, (typeof boards)[0]>();
      for (const board of boards) {
        const prev = seen.get(board.folderUri);
        if (!prev) {
          seen.set(board.folderUri, board);
        } else {
          const folderName = board.folderUri.replace(/\/$/, "").split("/").pop()!;
          if (board.id === folderName) {
            seen.set(board.folderUri, board);
          }
        }
      }
      boards = Array.from(seen.values());

      return boards;
    }),

  /** List boards with server-side pagination, search, and project filtering. */
  listPaged: shieldedProcedure
    .input(
      z.object({
        cursor: z.string().nullable().optional(),
        pageSize: z.number().int().min(1).max(120).nullable().optional(),
        projectId: z.string().trim().optional(),
        filterProjectId: z.string().trim().nullable().optional(),
        unboundOnly: z.boolean().optional(),
        search: z.string().nullable().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listBoardListPage(ctx.prisma, input);
    }),

  /** Batch-load thumbnails for boards. */
  thumbnails: shieldedProcedure
    .input(
      z.object({
        projectId: z.string().trim().optional(),
        boardIds: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      // 逻辑：从 DB 读取每个画布的 projectId 和 folderUri，独立解析路径，
      // 不依赖前端传入的 projectId，避免路径不匹配。
      const boardRecords = await ctx.prisma.board.findMany({
        where: { id: { in: input.boardIds } },
        select: { id: true, folderUri: true, projectId: true },
      });
      const boardMap = new Map(boardRecords.map((b: any) => [b.id, b as { folderUri: string; projectId: string | null }]));

      const results: Record<string, string> = {};
      await Promise.all(
        input.boardIds.map(async (boardId) => {
          try {
            const record = boardMap.get(boardId);
            if (!record?.folderUri) return;
            const rootPath = resolveBoardRootPath(record);
            const thumbPath = resolveBoardAbsPath(rootPath, record.folderUri, BOARD_THUMBNAIL_FILE_NAME);
            const buffer = await sharp(thumbPath)
              .resize(BOARD_THUMBNAIL_WIDTH, undefined, { fit: "inside" })
              .webp({ quality: BOARD_THUMBNAIL_QUALITY })
              .toBuffer();
            results[boardId] = `data:image/webp;base64,${buffer.toString("base64")}`;
          } catch {
            // No thumbnail — skip
          }
        }),
      );
      return { items: results };
    }),

  /** Get a single board by ID. */
  get: shieldedProcedure
    .input(z.object({ boardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const board = await ctx.prisma.board.findUnique({
        where: { id: input.boardId },
      });
      return board;
    }),

  /** Update board title, projectId, pin state, or color. */
  update: shieldedProcedure
    .input(
      z.object({
        boardId: z.string().min(1),
        title: z.string().optional(),
        projectId: z.string().nullable().optional(),
        isPin: z.boolean().optional(),
        colorIndex: z.number().int().min(0).max(7).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { boardId, ...data } = input;
      const board = await ctx.prisma.board.update({
        where: { id: boardId },
        data,
      });
      return board;
    }),

  /** Duplicate a board (DB record + file folder). */
  duplicate: shieldedProcedure
    .input(
      z.object({
        boardId: z.string().min(1),
        projectId: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const original = await ctx.prisma.board.findUnique({
        where: { id: input.boardId },
      });
      if (!original) throw new Error("Board not found");

      const newBoardId = createBoardId();
      const rootPath = resolveBoardScopedRoot(input.projectId);
      const newFolderUri = buildBoardFolderUri(rootPath, newBoardId);

      // Copy board folder on disk
      try {
        const boardsDir = resolveBoardDir(rootPath);
        const originalFolderName = original.folderUri.replace(/\/$/, "").split("/").pop()!;
        const srcDir = path.join(boardsDir, originalFolderName);
        const destDir = path.join(boardsDir, newBoardId);

        await fs.cp(srcDir, destDir, { recursive: true });

        // Replace old board references in JSON snapshot so paths stay correct
        const jsonPath = path.join(destDir, "index.tnboard.json");
        try {
          const jsonContent = await fs.readFile(jsonPath, "utf-8");
          const updated = jsonContent.replaceAll(originalFolderName, newBoardId);
          await fs.writeFile(jsonPath, updated);
        } catch {
          // JSON file may not exist — non-critical
        }

        // Remove binary Yjs snapshot so board recovers from the updated JSON
        try {
          await fs.rm(path.join(destDir, "index.tnboard"), { force: true });
        } catch {
          // Non-critical
        }
      } catch (error) {
        console.warn("[board.duplicate] failed to copy folder", error);
      }

      const board = await ctx.prisma.board.create({
        data: {
          id: newBoardId,
          title: `${original.title} (copy)`,
          projectId: input.projectId ?? original.projectId,
          folderUri: newFolderUri,
        },
      });

      try {
        await recordEntityVisit(ctx.prisma, {
          entityType: "board",
          entityId: resolveBoardEntityId(board.folderUri),
          projectId: board.projectId ?? undefined,
          trigger: "board-create",
        });
      } catch (error) {
        // 逻辑：进入记录失败不应阻断画布复制主流程。
        console.warn("[board.duplicate] failed to record entity visit", error);
      }

      return board;
    }),

  /** Soft-delete a board. */
  delete: shieldedProcedure
    .input(z.object({ boardId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.board.update({
        where: { id: input.boardId },
        data: { deletedAt: new Date() },
      });
      // Soft-delete associated ChatSession
      try {
        await ctx.prisma.chatSession.updateMany({
          where: { boardId: input.boardId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      } catch {
        // Non-critical, ignore
      }
      return { success: true };
    }),

  /** Hard-delete a board (DB record + file folder). */
  hardDelete: shieldedProcedure
    .input(
      z.object({
        boardId: z.string().min(1),
        projectId: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.prisma.board.findUnique({
        where: { id: input.boardId },
        select: { id: true, folderUri: true, projectId: true },
      });
      if (!board) return { success: false };

      const { deletedSessions } = await hardDeleteBoardResources(ctx.prisma, board);
      return {
        success: true,
        deletedSessions,
      };
    }),

  /** Move a board to a different project (updates DB + relocates folder). */
  moveToProject: shieldedProcedure
    .input(
      z.object({
        boardId: z.string().min(1),
        targetProjectId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.prisma.board.findUnique({
        where: { id: input.boardId },
        select: { id: true, folderUri: true, projectId: true },
      });
      if (!board) throw new Error("Board not found");

      const srcProjectId = board.projectId ?? undefined;
      const destProjectId = input.targetProjectId.trim();

      // Skip if already in the target project
      if (srcProjectId === destProjectId) return board;

      // Move physical folder
      const folderName = resolveBoardFolderName(board.folderUri);
      const destRoot = resolveBoardScopedRoot(destProjectId);
      const newFolderUri = buildBoardFolderUri(destRoot, folderName);
      try {
        const srcRoot = resolveBoardRootPath(board);
        const srcDir = resolveBoardDir(srcRoot, folderName);
        const destBoardsDir = resolveBoardDir(destRoot);
        await fs.mkdir(destBoardsDir, { recursive: true });
        const destDir = path.join(destBoardsDir, folderName);
        await fs.rename(srcDir, destDir);
      } catch (error) {
        console.warn("[board.moveToProject] failed to move folder", error);
        // Fall through to update DB even if folder move fails
      }

      // Update DB record — 同时更新 folderUri 以匹配目标项目的路径格式
      const updated = await ctx.prisma.board.update({
        where: { id: input.boardId },
        data: { projectId: destProjectId, folderUri: newFolderUri },
      });

      return updated;
    }),

  /** Hard-delete all boards that are not attached to any project. */
  clearUnboundBoards: shieldedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      const boards = await ctx.prisma.board.findMany({
        where: { projectId: null },
        select: { id: true, folderUri: true, projectId: true },
      });

      let deletedBoards = 0;
      let deletedSessions = 0;

      for (const board of boards) {
        try {
          const result = await hardDeleteBoardResources(ctx.prisma, board);
          deletedBoards += 1;
          deletedSessions += result.deletedSessions;
        } catch (error) {
          console.warn("[board.clearUnboundBoards] failed to delete board", error);
        }
      }

      return {
        deletedBoards,
        deletedSessions,
      };
    }),
});

export type BoardRouter = typeof boardRouter;
