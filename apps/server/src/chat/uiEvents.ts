import type { DockItem, Tab } from "@teatime-ai/api/types/tabs";
import { requestContextManager } from "@/context/requestContext";

// ==========
// MVP：前后端约定的 UI 事件协议（Streaming Custom Data）
// - 通过 writer.write({ type: 'data-ui-event', data: ... }) 推给前端
// - 前端在 ChatProvider.onData 中消费并更新 zustand tabs
// ==========

export const UI_EVENT_PART_TYPE = "data-ui-event" as const;

export type UiEvent =
  | {
      kind: "push-stack-item";
      tabId: string;
      item: DockItem;
    };

function stableIdFromUrl(url: string) {
  // MVP：不引入额外依赖，用可重复的 key 做去重（断线重放也不会重复打开）
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return `open-url:${Math.abs(hash)}`;
}

export function requireActiveTab(): Tab {
  const tab = requestContextManager.getContext()?.activeTab;
  if (!tab) throw new Error("activeTab is required.");
  return tab;
}

export function emitUiEvent(event: UiEvent) {
  const writer = requestContextManager.getUIWriter();
  if (!writer) throw new Error("UI writer is not available.");

  // 关键：transient=true，避免把 UI 操作写进 message 历史（仅用于驱动 UI）
  writer.write({
    type: UI_EVENT_PART_TYPE,
    data: event,
    transient: true,
  } as any);
}

export function emitOpenUrl({ url, title }: { url: string; title?: string }) {
  const activeTab = requireActiveTab();
  const key = stableIdFromUrl(url);

  emitUiEvent({
    kind: "push-stack-item",
    tabId: activeTab.id,
    item: {
      id: `browser-window:${key}`,
      sourceKey: key,
      component: "electron-browser-window",
      title: title ?? "Browser Window",
      params: { url, autoOpen: true },
    },
  });
}

