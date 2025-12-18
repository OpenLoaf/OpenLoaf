import { requestContextManager } from "@/context/requestContext";
import type { UiEvent } from "@teatime-ai/api/types/event";
import { browserRuntimeHub } from "@/runtime/browserRuntimeHub";

/**
 * 通过 Browser Runtime（WS）把 UiEvent 下发给 Electron，并由 Electron main 通过 IPC 推给 renderer。
 */
export async function emitRuntimeUiEvent(event: UiEvent) {
  const electronClientId = requestContextManager.getElectronClientId();
  if (!electronClientId) {
    throw new Error("electronClientId is required for UI operations.");
  }
  if (!browserRuntimeHub.hasElectronRuntime(electronClientId)) {
    throw new Error(
      `Electron runtime offline: electronClientId=${electronClientId}`,
    );
  }
  await browserRuntimeHub.emitUiEventOnElectron({ electronClientId, event });
}

