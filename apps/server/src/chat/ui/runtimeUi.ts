import { requestContextManager } from "@/context/requestContext";
import type { UiEvent } from "@teatime-ai/api/types/event";
import { browserRuntimeHub } from "@/runtime/browserRuntimeHub";

/**
 * 通过 Browser Runtime（WS）把 UiEvent 下发给 Electron，并由 Electron main 通过 IPC 推给 renderer。
 */
export async function emitRuntimeUiEvent(event: UiEvent) {
  const appId = requestContextManager.getAppId();
  if (!appId) {
    throw new Error("appId is required for UI operations.");
  }
  if (!browserRuntimeHub.hasElectronRuntime(appId)) {
    throw new Error(`Electron runtime offline: appId=${appId}`);
  }
  await browserRuntimeHub.emitUiEventOnElectron({ appId, event });
}
