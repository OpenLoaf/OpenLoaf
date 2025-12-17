import type { DockItem, Tab } from "@teatime-ai/api/common";

// ==========
// MVP：前端 -> 后端的上下文（通过 data-client-context 传递）
// ==========

export type ClientContext = {
  activeTab: Tab | null;
};

// ==========
// MVP：后端 -> 前端的 UI 事件（通过 data-ui-event 传递）
// ==========

export type UiEvent =
  | {
      kind: "push-stack-item";
      tabId: string;
      item: DockItem;
    };
