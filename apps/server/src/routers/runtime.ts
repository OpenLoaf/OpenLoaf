import { BaseRuntimeRouter, runtimeSchemas, shieldedProcedure, t } from "@teatime-ai/api";
import { browserRuntimeHub } from "../runtime/browserRuntimeHub";

export class RuntimeRouterImpl extends BaseRuntimeRouter {
  public static createRouter() {
    return t.router({
      getAppStatus: shieldedProcedure
        .input(runtimeSchemas.getAppStatus.input)
        .output(runtimeSchemas.getAppStatus.output)
        .query(async ({ input }) => {
          // 中文注释：这里不做鉴权绑定校验（MVP）；后续需要根据账号/设备绑定关系过滤 appId。
          const status = browserRuntimeHub.getElectronRuntimeStatus(input.appId);
          return { ok: true, ...status };
        }),
    });
  }
}

export const runtimeRouterImplementation = RuntimeRouterImpl.createRouter();

