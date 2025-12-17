import type { DockItem, Tab } from "../common";

// ==========
// MVP：前端 -> 后端的上下文（通过 data-client-context 传递）
// ==========

export type ClientContext = {
  activeTab: Tab | null;
};

// ==========
// MVP：后端 -> 前端的 UI 事件（通过 data-ui-event 传递）
// - 约定：只能在这里新增/修改 kind，业务侧不要手写 kind 字符串
// ==========

export enum UiEventKind {
  PushStackItem = "push-stack-item",
  CloseStack = "close-stack",
  RefreshPageTree = "refresh-page-tree",
  RefreshBasePanel = "refresh-base-panel",
}

export type UiEvent =
  | {
      kind: UiEventKind.PushStackItem;
      tabId: string;
      item: DockItem;
    }
  | {
      // 关闭左侧 stack（仅关闭 overlay stack，不影响 base）
      kind: UiEventKind.CloseStack;
      tabId: string;
    }
  | {
      // 刷新 Page Tree（通常用于侧边栏页面树）
      kind: UiEventKind.RefreshPageTree;
      tabId: string;
    }
  | {
      // 刷新当前 tab 的 base 面板（通过变更 refreshKey 强制 remount）
      kind: UiEventKind.RefreshBasePanel;
      tabId: string;
    };

// 事件工厂：避免业务侧手拼对象/拼错字段，统一从这里生成 UiEvent。
export const uiEvents = {
  pushStackItem: (input: { tabId: string; item: DockItem }): UiEvent => ({
    kind: UiEventKind.PushStackItem,
    tabId: input.tabId,
    item: input.item,
  }),
  closeStack: (input: { tabId: string }): UiEvent => ({
    kind: UiEventKind.CloseStack,
    tabId: input.tabId,
  }),
  refreshPageTree: (input: { tabId: string }): UiEvent => ({
    kind: UiEventKind.RefreshPageTree,
    tabId: input.tabId,
  }),
  refreshBasePanel: (input: { tabId: string }): UiEvent => ({
    kind: UiEventKind.RefreshBasePanel,
    tabId: input.tabId,
  }),
} as const;
