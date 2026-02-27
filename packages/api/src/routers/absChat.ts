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
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";

export const chatSchemas = {
  /**
   * 根据会话历史自动生成标题（MVP）：
   * - 仅输入 sessionId
   * - 输出最终标题（由 server 侧决定是否落库/覆盖）
   */
  autoTitle: {
    input: z.object({
      sessionId: z.string().min(1),
    }),
    output: z.object({
      ok: z.literal(true),
      title: z.string().min(1),
    }),
  },
  /**
   * Fetch session preface content (MVP).
   */
  getSessionPreface: {
    input: z.object({
      sessionId: z.string().min(1),
      /** Optional leaf message id from the currently displayed branch. */
      leafMessageId: z.string().min(1).optional(),
    }),
    output: z.object({
      content: z.string(),
      /** Absolute jsonl file path for debugging when available. */
      jsonlPath: z.string().optional(),
      /** Raw system.json content as string for AI debug mode. */
      systemJsonRaw: z.string().optional(),
    }),
  },
};

export abstract class BaseChatRouter {
  public static routeName = "chat";

  public static createRouter() {
    return t.router({
      autoTitle: shieldedProcedure
        .input(chatSchemas.autoTitle.input)
        .output(chatSchemas.autoTitle.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getSessionPreface: shieldedProcedure
        .input(chatSchemas.getSessionPreface.input)
        .output(chatSchemas.getSessionPreface.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const chatBaseRouter = BaseChatRouter.createRouter();
export type ChatBaseRouter = typeof chatBaseRouter;
