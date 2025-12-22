import { z } from "zod";
import { t, shieldedProcedure } from "../index";
import { getProjectList, type PageTreeNode } from "../services/pageService";
import { refreshPageMarkdownCache } from "../services/pageMarkdownService";

const PageTreeNodeSchema: z.ZodType<PageTreeNode> = z.object({
  id: z.string(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
  cover: z.string().nullable(),
  isExpanded: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  parentId: z.string().nullable(),
  children: z.lazy(() => PageTreeNodeSchema.array()),
  resources: z.array(z.any()),
  workspaceId: z.string(),
});

const pageGetAllInputSchema = z.object({
  workspaceId: z.string(),
});

const pageGetMarkdownInputSchema = z.object({
  pageId: z.string(),
});

export const pageRouter = t.router({
  getAll: shieldedProcedure
    .input(pageGetAllInputSchema)
    .query(async ({ ctx, input }): Promise<PageTreeNode[]> => {
      return getProjectList(input.workspaceId, ctx.prisma);
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
