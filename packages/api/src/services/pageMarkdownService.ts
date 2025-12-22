import type { PrismaClient } from "@teatime-ai/db/prisma/generated/client";
import { blocksToMarkdown, type BlockInput } from "../markdown/block-markdown";

const EMPTY_MARKDOWN = "";

/** Load top-level blocks ordered by position. */
const loadTopLevelBlocks = async (prisma: PrismaClient, pageId: string) => {
  return prisma.block.findMany({
    where: { pageId, parentId: null },
    orderBy: { order: "asc" },
    select: { content: true, order: true },
  });
};

/** Convert blocks to markdown string. */
const toMarkdown = (blocks: { content: BlockInput["content"]; order: number }[]) =>
  blocksToMarkdown(
    blocks.map((block) => ({
      content: block.content ?? null,
      order: block.order,
    }))
  );

export type PageMarkdownResult = {
  markdown: string;
  updated: boolean;
  blockVersion: number;
  markdownVersion: number;
};

/** Refresh markdown cache for a page when versions differ. */
export const refreshPageMarkdownCache = async (
  prisma: PrismaClient,
  pageId: string
): Promise<PageMarkdownResult | null> => {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, markdown: true, blockVersion: true, markdownVersion: true },
  });

  if (!page) return null;

  // 中文注释：版本一致时直接返回缓存，避免重复转换。
  if (page.blockVersion === page.markdownVersion) {
    return {
      markdown: page.markdown ?? EMPTY_MARKDOWN,
      updated: false,
      blockVersion: page.blockVersion,
      markdownVersion: page.markdownVersion,
    };
  }

  const blocks = await loadTopLevelBlocks(prisma, pageId);
  const markdown = blocks.length ? toMarkdown(blocks) : EMPTY_MARKDOWN;

  await prisma.page.update({
    where: { id: pageId },
    data: {
      markdown,
      markdownVersion: page.blockVersion,
    },
  });

  return {
    markdown,
    updated: true,
    blockVersion: page.blockVersion,
    markdownVersion: page.blockVersion,
  };
};

/** Refresh markdown cache for all pages. */
export const refreshAllPageMarkdownCache = async (prisma: PrismaClient) => {
  const pages = await prisma.page.findMany({
    select: { id: true, blockVersion: true, markdownVersion: true },
  });

  if (pages.length === 0) {
    return { updated: 0 };
  }

  let updated = 0;

  // 定时任务用顺序执行，避免高峰期占用过多连接
  for (const page of pages) {
    const result = await refreshPageMarkdownCache(prisma, page.id);
    if (result?.updated) updated += 1;
  }

  return { updated };
};
