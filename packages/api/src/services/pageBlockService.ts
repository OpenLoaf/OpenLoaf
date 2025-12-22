import { Prisma, type PrismaClient } from "@teatime-ai/db/prisma/generated/client";

const DEFAULT_BLOCK_TYPE = "paragraph";

export type PageBlockInput = {
  content: Prisma.InputJsonValue | null;
  order?: number | null;
  type?: string | null;
  props?: Prisma.InputJsonValue | null;
};

export type PageBlockOutput = {
  id: string;
  content: Prisma.JsonValue | null;
  order: number;
  type: string;
  props: Prisma.JsonValue | null;
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
            ((block.content as { type?: string } | null) ?? undefined)?.type ??
            DEFAULT_BLOCK_TYPE,
          props: block.props ?? Prisma.JsonNull,
          content: block.content ?? Prisma.JsonNull,
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
