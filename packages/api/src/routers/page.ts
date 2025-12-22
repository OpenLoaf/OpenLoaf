import { z } from "zod";
import { t, shieldedProcedure } from "../index";
import { getProjectList, type PageTreeNode } from "../services/pageService";
import { refreshPageMarkdownCache } from "../services/pageMarkdownService";
import {
  getPageBlocks,
  savePageBlocks,
  type PageBlockInput,
  type PageBlockOutput,
} from "../services/pageBlockService";

const pageGetAllInputSchema = z.object({
  workspaceId: z.string(),
});

const pageGetMarkdownInputSchema = z.object({
  pageId: z.string(),
});

const pageGetBlocksInputSchema = z.object({
  pageId: z.string(),
});

const pageSaveBlocksInputSchema: z.ZodType<{
  pageId: string;
  blocks: PageBlockInput[];
}> = z.object({
  pageId: z.string(),
  blocks: z.array(
    z.object({
      content: z.any().nullable(),
      order: z.number().optional().nullable(),
      type: z.string().optional().nullable(),
      props: z.any().optional().nullable(),
    })
  ),
});

export const pageRouter = t.router({
  /** Get page tree. */
  getAll: shieldedProcedure
    .input(pageGetAllInputSchema)
    .query(async ({ ctx, input }): Promise<PageTreeNode[]> => {
      return getProjectList(input.workspaceId, ctx.prisma);
    }),
  /** Get page blocks. */
  getBlocks: shieldedProcedure
    .input(pageGetBlocksInputSchema)
    .query(async ({ ctx, input }): Promise<{ blocks: PageBlockOutput[] }> => {
      const blocks = await getPageBlocks(ctx.prisma, input.pageId);
      return { blocks };
    }),
  /** Save blocks and update block version. */
  saveBlocks: shieldedProcedure
    .input(pageSaveBlocksInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ blockVersion: number }> => {
      const result = await savePageBlocks(
        ctx.prisma,
        input.pageId,
        input.blocks
      );
      return { blockVersion: result.blockVersion };
    }),
  /** Get page markdown with cache refresh. */
  getMarkdown: shieldedProcedure
    .input(pageGetMarkdownInputSchema)
    .query(async ({ ctx, input }): Promise<{ markdown: string }> => {
      const result = await refreshPageMarkdownCache(ctx.prisma, input.pageId);
      return { markdown: result?.markdown ?? "" };
    }),
});

export type PageRouter = typeof pageRouter;
