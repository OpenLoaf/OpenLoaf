import { BaseRuntimeRouter, runtimeSchemas, shieldedProcedure, t } from "@teatime-ai/api";
import { runtimeHub } from "@/modules/runtime/RuntimeHubAdapter";

export class RuntimeRouterImpl extends BaseRuntimeRouter {
  /** 运行时状态查询（MVP）：仅用于 UI 展示在线状态。 */
  public static createRouter() {
    return t.router({
      getAppStatus: shieldedProcedure
        .input(runtimeSchemas.getAppStatus.input)
        .output(runtimeSchemas.getAppStatus.output)
        .query(async ({ input }) => {
          const status = runtimeHub.getElectronRuntimeStatus(input.appId);
          return { ok: true, ...status };
        }),
    });
  }
}

export const runtimeRouterImplementation = RuntimeRouterImpl.createRouter();
