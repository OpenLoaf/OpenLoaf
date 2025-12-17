import type { Tab } from "@teatime-ai/api/common";
import { requestContextManager } from "@/context/requestContext";
import { UI_EVENT_PART_TYPE } from "./parts";
import type { UiEvent } from "./types";

// ==========
// MVP：唯一出口：通过 writer.write 往前端推 UI 事件
// ==========

export function requireActiveTab(): Tab {
  const tab = requestContextManager.getContext()?.activeTab;
  if (!tab) throw new Error("activeTab is required.");
  return tab;
}

export function emitUiEvent(event: UiEvent) {
  const writer = requestContextManager.getUIWriter();
  if (!writer) throw new Error("UI writer is not available.");

  // 关键：transient=true，避免把 UI 操作写进 message 历史（仅用于驱动 UI）
  writer.write({ type: UI_EVENT_PART_TYPE, data: event, transient: true } as any);
}
