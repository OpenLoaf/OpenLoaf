import { z } from "zod";
import { t, shieldedProcedure } from "../index";
import { getBoardSnapshot, saveBoardSnapshot } from "../services/boardService";

const boardGetInputSchema = z.object({
  workspaceId: z.string(),
  pageId: z.string(),
});

const boardSaveInputSchema = z.object({
  workspaceId: z.string(),
  pageId: z.string(),
  schemaVersion: z.number().optional().nullable(),
  nodes: z.any(),
  connectors: z.any(),
  viewport: z.any(),
});

/** Board snapshot router. */
export const boardRouter = t.router({
  /** Get board snapshot. */
  get: shieldedProcedure
    .input(boardGetInputSchema)
    .query(async ({ ctx, input }) => {
      const board = await getBoardSnapshot(
        ctx.prisma,
        input.workspaceId,
        input.pageId
      );
      return { board };
    }),
  /** Save board snapshot. */
  save: shieldedProcedure
    .input(boardSaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await saveBoardSnapshot(ctx.prisma, input);
      return result;
    }),
});

export type BoardRouter = typeof boardRouter;
