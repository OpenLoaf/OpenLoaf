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
import type { Tab } from "../common";

/**
 * Tab 快照同步（MVP）：
 * - Web 侧在一次 /chat/sse 生命周期内，将“该 tabId 对应的 Tab 数据”持续上报到 server
 * - server 使用 TTL 缓存保存，供 agent/tools 读取“当前 UI 状态”
 */

export const tabSchemas = {
  upsertSnapshot: {
    input: z.object({
      sessionId: z.string().min(1),
      clientId: z.string().min(1),
      tabId: z.string().min(1),
      seq: z.number().int().min(0),
      // MVP：不做深度校验，Tab 结构由同项目 Web 端产生，按 TS 类型约束即可。
      tab: z.any() as z.ZodType<Tab>,
    }),
    output: z.object({ ok: z.literal(true) }),
  },
  getSnapshot: {
    input: z.object({
      sessionId: z.string().min(1),
      clientId: z.string().min(1),
      tabId: z.string().min(1),
    }),
    output: z.object({
      ok: z.literal(true),
      tab: (z.any() as z.ZodType<Tab>).nullable(),
    }),
  },
};

export abstract class BaseTabRouter {
  public static routeName = "tab";

  public static createRouter() {
    return t.router({
      upsertSnapshot: shieldedProcedure
        .input(tabSchemas.upsertSnapshot.input)
        .output(tabSchemas.upsertSnapshot.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),

      getSnapshot: shieldedProcedure
        .input(tabSchemas.getSnapshot.input)
        .output(tabSchemas.getSnapshot.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const tabRouter = BaseTabRouter.createRouter();
export type TabRouter = typeof tabRouter;
