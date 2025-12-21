import { z } from "zod";
import { t, shieldedProcedure } from "../index";
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
  reportBrowserCommandResult: {
    input: z.object({
      sessionId: z.string().min(1),
      clientId: z.string().min(1),
      tabId: z.string().min(1),
      commandId: z.string().min(1),
      // MVP：工具结果由本项目 Web/Electron 产生，server 只做透传与等待协调，不做深度校验。
      result: z.any(),
    }),
    output: z.object({ ok: z.literal(true) }),
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

      reportBrowserCommandResult: shieldedProcedure
        .input(tabSchemas.reportBrowserCommandResult.input)
        .output(tabSchemas.reportBrowserCommandResult.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const tabRouter = BaseTabRouter.createRouter();
export type TabRouter = typeof tabRouter;
