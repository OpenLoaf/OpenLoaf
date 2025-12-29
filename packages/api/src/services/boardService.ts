import { Prisma, type PrismaClient } from "@teatime-ai/db/prisma/generated/client";

export type BoardSnapshotInput = {
  /** Workspace id. */
  workspaceId: string;
  /** Page id used as board scope. */
  pageId: string;
  /** Snapshot schema version. */
  schemaVersion?: number | null;
  /** Node snapshot payload. */
  nodes: Prisma.InputJsonValue;
  /** Connector snapshot payload. */
  connectors: Prisma.InputJsonValue;
  /** Viewport snapshot payload. */
  viewport: Prisma.InputJsonValue;
};

export type BoardSnapshotOutput = {
  /** Board id. */
  id: string;
  /** Snapshot schema version. */
  schemaVersion: number;
  /** Node snapshot payload. */
  nodes: Prisma.JsonValue;
  /** Connector snapshot payload. */
  connectors: Prisma.JsonValue;
  /** Viewport snapshot payload. */
  viewport: Prisma.JsonValue;
  /** Board snapshot version. */
  version: number;
};

/** Load a board snapshot by page id. */
export const getBoardSnapshot = async (
  prisma: PrismaClient,
  workspaceId: string,
  pageId: string
): Promise<BoardSnapshotOutput | null> => {
  return prisma.board.findFirst({
    where: { workspaceId, pageId },
    select: {
      id: true,
      schemaVersion: true,
      nodes: true,
      connectors: true,
      viewport: true,
      version: true,
    },
  });
};

/** Save board snapshot with version increment. */
export const saveBoardSnapshot = async (
  prisma: PrismaClient,
  input: BoardSnapshotInput
): Promise<{ id: string; version: number }> => {
  const schemaVersion = input.schemaVersion ?? 1;

  // 逻辑：以 pageId 为唯一键写入，更新时递增 version。
  const board = await prisma.board.upsert({
    where: { pageId: input.pageId },
    create: {
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      schemaVersion,
      nodes: input.nodes ?? Prisma.JsonNull,
      connectors: input.connectors ?? Prisma.JsonNull,
      viewport: input.viewport ?? Prisma.JsonNull,
      version: 1,
    },
    update: {
      schemaVersion,
      nodes: input.nodes ?? Prisma.JsonNull,
      connectors: input.connectors ?? Prisma.JsonNull,
      viewport: input.viewport ?? Prisma.JsonNull,
      version: { increment: 1 },
    },
    select: { id: true, version: true },
  });

  return board;
};
