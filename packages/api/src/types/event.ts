import type { DockItem, Tab } from "../common";

// ==========
// MVP：前端 -> 后端的上下文（通过 data-client-context 传递）
// ==========

export type ClientContext = {
  activeTab: Tab | null;
  /** Web UI 侧稳定 clientId（用于 runtime 调度/断线续传关联） */
  webClientId: string;
  /** Electron runtime 设备标识（仅 Electron 环境提供） */
  electronClientId?: string;
};

// ==========
// UI 事件（Electron runtime -> renderer 通过 IPC 推送）
// - 约定：只能在这里新增/修改 kind，业务侧不要手写 kind 字符串
// ==========

export enum UiEventKind {
  PushStackItem = "push-stack-item",
}

export type UiEvent =
  | {
      kind: UiEventKind.PushStackItem;
      tabId: string;
      item: DockItem;
    };

// 事件工厂：避免业务侧手拼对象/拼错字段，统一从这里生成 UiEvent。
export const uiEvents = {
  pushStackItem: (input: { tabId: string; item: DockItem }): UiEvent => ({
    kind: UiEventKind.PushStackItem,
    tabId: input.tabId,
    item: input.item,
  }),
} as const;
