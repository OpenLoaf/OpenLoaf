import type { PrismaClient } from "@teatime-ai/db/prisma/generated/client";

const DEFAULT_BLOCK_TYPE = "paragraph";

export type PageBlockInput = {
  content: Record<string, unknown> | null;
  order?: number | null;
  type?: string | null;
  props?: Record<string, unknown> | null;
};

export type PageBlockOutput = {
  id: string;
  content: Record<string, unknown> | null;
  order: number;
  type: string;
  props: Record<string, unknown> | null;
};

/** Load top-level blocks for a page. */
export const getPageBlocks = async (
  prisma: PrismaClient,
  pageId: string
): Promise<PageBlockOutput[]> => {
  return prisma.block.findMany({
    where: { pageId, parentId: null },
    orderBy: { order: "asc" },
    select: {
      id: true,
      content: true,
      order: true,
      type: true,
      props: true,
    },
  });
};

/** Save blocks by replacing all existing top-level blocks. */
export const savePageBlocks = async (
  prisma: PrismaClient,
  pageId: string,
  blocks: PageBlockInput[]
) => {
  const blockVersion = Date.now();
  const blockTimestamp = new Date(blockVersion);

  await prisma.$transaction(async (tx) => {
    // 只保留顶层块，避免嵌套结构重复存储
    await tx.block.deleteMany({ where: { pageId } });

    if (blocks.length > 0) {
      await tx.block.createMany({
        data: blocks.map((block, index) => ({
          pageId,
          type:
            block.type ??
            (block.content as { type?: string })?.type ??
            DEFAULT_BLOCK_TYPE,
          props: block.props ?? null,
          content: block.content ?? null,
          parentId: null,
          order: block.order ?? index,
          createdAt: blockTimestamp,
          updatedAt: blockTimestamp,
        })),
      });
    }

    await tx.page.update({
      where: { id: pageId },
      data: { blockVersion },
    });
  });

  return { blockVersion };
};
