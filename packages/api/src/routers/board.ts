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
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import { createBoardId } from "../common/boardId";
import { resolveScopedRootPath } from "../services/vfsService";

const BOARD_THUMBNAIL_FILE_NAME = "index.png";
const BOARD_THUMBNAIL_WIDTH = 280;
const BOARD_THUMBNAIL_QUALITY = 60;

const BOARD_FOLDER_PREFIX = "board_";
const BOARD_FOLDER_PREFIX_LEGACY = "tnboard_";

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
 * Scan .openloaf/boards/ on disk and create DB records for folders
 * that have no matching record yet. Returns newly synced boards.
 */
async function syncBoardsFromDisk(
  prisma: any,
  input: { workspaceId: string; projectId?: string },
): Promise<void> {
  let rootPath: string;
  try {
    rootPath = resolveScopedRootPath(input);
  } catch (err) {
    console.warn("[syncBoardsFromDisk] resolveScopedRootPath failed:", err);
    return;
  }

  const boardsDir = path.join(rootPath, ".openloaf", "boards");
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

  // Check which ones already have DB records (by folderUri)
  const folderUris = toSync.map((b) => `.openloaf/boards/${b.folderName}/`);
  const existing = await prisma.board.findMany({
    where: {
      workspaceId: input.workspaceId,
      folderUri: { in: folderUris },
    },
    select: { folderUri: true },
  });
  const existingSet = new Set(existing.map((b: any) => b.folderUri));

  // Create missing records
  const newRecords = toSync
    .filter((b) => !existingSet.has(`.openloaf/boards/${b.folderName}/`))
    .map((b) => ({
      id: createBoardId(),
      title: extractBoardTitle(b.folderName),
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      folderUri: `.openloaf/boards/${b.folderName}/`,
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

export const boardRouter = t.router({
  /** Create a new board with DB record and file structure. */
  create: shieldedProcedure
    .input(
      z.object({
        workspaceId: z.string().trim().min(1),
        projectId: z.string().trim().optional(),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const boardId = createBoardId();
      const folderUri = `.openloaf/boards/${boardId}/`;

      const now = new Date();
      const defaultTitle = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const board = await ctx.prisma.board.create({
        data: {
          id: boardId,
          title: input.title ?? defaultTitle,
          workspaceId: input.workspaceId,
          projectId: input.projectId ?? null,
          folderUri,
        },
      });

      return board;
    }),

  /** List boards for a workspace, optionally filtered by project. */
  list: shieldedProcedure
    .input(
      z.object({
        workspaceId: z.string().trim().min(1),
        projectId: z.string().trim().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        deletedAt: null,
        workspaceId: input.workspaceId,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      };
      const selectFields = {
        id: true,
        title: true,
        isPin: true,
        workspaceId: true,
        projectId: true,
        folderUri: true,
        createdAt: true,
        updatedAt: true,
      };

      let boards = await ctx.prisma.board.findMany({
        where,
        orderBy: [{ isPin: "desc" }, { updatedAt: "desc" }],
        select: selectFields,
      });

      // If DB has no records for this scope, try syncing from filesystem.
      if (boards.length === 0) {
        try {
          await syncBoardsFromDisk(ctx.prisma, {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
          });
          boards = await ctx.prisma.board.findMany({
            where,
            orderBy: [{ isPin: "desc" }, { updatedAt: "desc" }],
            select: selectFields,
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

  /** Batch-load thumbnails for boards. */
  thumbnails: shieldedProcedure
    .input(
      z.object({
        workspaceId: z.string().trim().min(1),
        projectId: z.string().trim().optional(),
        boardIds: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      let rootPath: string;
      try {
        rootPath = resolveScopedRootPath(input);
      } catch {
        return { items: {} as Record<string, string> };
      }

      // Look up folderUri for each board so legacy folders (tnboard_*) resolve correctly
      const boardRecords = await ctx.prisma.board.findMany({
        where: { id: { in: input.boardIds } },
        select: { id: true, folderUri: true },
      });
      const folderUriMap = new Map(boardRecords.map((b: any) => [b.id, b.folderUri as string]));

      const results: Record<string, string> = {};
      await Promise.all(
        input.boardIds.map(async (boardId) => {
          try {
            const folderUri = folderUriMap.get(boardId);
            // folderUri is like ".openloaf/boards/tnboard_xxx/" — extract folder name
            const folderName = folderUri
              ? folderUri.replace(/\/$/, "").split("/").pop()!
              : boardId;
            const thumbPath = path.join(
              rootPath, ".openloaf", "boards", folderName, BOARD_THUMBNAIL_FILE_NAME,
            );
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

  /** Update board title, projectId, or pin state. */
  update: shieldedProcedure
    .input(
      z.object({
        boardId: z.string().min(1),
        title: z.string().optional(),
        projectId: z.string().nullable().optional(),
        isPin: z.boolean().optional(),
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
        workspaceId: z.string().trim().min(1),
        projectId: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.prisma.board.findUnique({
        where: { id: input.boardId },
      });
      if (!board) return { success: false };

      // Delete DB record
      await ctx.prisma.board.delete({
        where: { id: input.boardId },
      });

      // Delete associated ChatSession (boardId = sessionId for board chat)
      try {
        await ctx.prisma.chatSession.deleteMany({
          where: { boardId: input.boardId },
        });
      } catch (error) {
        console.warn("[board.hardDelete] failed to delete chat session", error);
      }

      // Delete file folder
      try {
        const rootPath = resolveScopedRootPath({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        });
        const boardDir = path.join(rootPath, ".openloaf", "boards", input.boardId);
        await fs.rm(boardDir, { recursive: true, force: true });
      } catch (error) {
        console.warn("[board.hardDelete] failed to delete folder", error);
      }

      return { success: true };
    }),
});

export type BoardRouter = typeof boardRouter;
