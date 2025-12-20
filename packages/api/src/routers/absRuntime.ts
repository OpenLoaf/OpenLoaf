import { z } from "zod";
import { t, shieldedProcedure } from "../index";

export const runtimeSchemas = {
  getAppStatus: {
    input: z.object({
      appId: z.string().min(1),
    }),
    output: z.object({
      ok: z.literal(true),
      connected: z.boolean(),
      connectedAt: z.number().int().optional(),
      instanceId: z.string().optional(),
    }),
  },
};

export abstract class BaseRuntimeRouter {
  public static routeName = "runtime";

  public static createRouter() {
    return t.router({
      /**
       * 查询 appId 对应的 Electron runtime 连接状态。
       * - 用于 UI 展示“是否已连接到 server 的 /runtime-ws”
       */
      getAppStatus: shieldedProcedure
        .input(runtimeSchemas.getAppStatus.input)
        .output(runtimeSchemas.getAppStatus.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const runtimeRouter = BaseRuntimeRouter.createRouter();
export type RuntimeRouter = typeof runtimeRouter;

