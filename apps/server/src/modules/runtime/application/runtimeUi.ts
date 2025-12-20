import type { UiEvent } from "@teatime-ai/api/types/event";
import { getAppId } from "@/shared/requestContext";
import { runtimeHub } from "@/modules/runtime/infrastructure/ws/runtimeHub";

/**
 * 通过 Browser Runtime（WS）把 UiEvent 下发给 Electron，并由 Electron main 通过 IPC 推给 renderer。
 */
export async function emitRuntimeUiEvent(event: UiEvent) {
  const appId = getAppId();
  if (!appId) {
    throw new Error("appId is required for UI operations.");
  }
  if (!runtimeHub.hasElectronRuntime(appId)) {
    throw new Error(`Electron runtime offline: appId=${appId}`);
  }
  await runtimeHub.emitUiEventOnElectron({ appId, event });
}
