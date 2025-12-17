import type { DockItem, Tab } from "../tabs/types";

// 前端 -> 后端：请求上下文
export type ClientContext = {
  activeTab: Tab | null;
};

// 后端 -> 前端：UI 事件（Streaming Custom Data）
export type UiEvent =
  | {
      kind: "push-stack-item";
      tabId: string;
      item: DockItem;
    };

