/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { z } from "zod";
import type { DockItem } from "../common";

// ==========
// UI 事件（Electron runtime -> renderer 通过 IPC 推送）
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
  refreshPageTree: (): UiEvent => ({
    kind: UiEventKind.RefreshPageTree,
  }),
  refreshBasePanel: (input: { tabId: string }): UiEvent => ({
    kind: UiEventKind.RefreshBasePanel,
    tabId: input.tabId,
  }),
} as const;

// ==========
// Zod schema（用于 runtime WS 协议校验）
// ==========

const dockItemSchema = z.object({
  id: z.string().min(1),
  component: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  title: z.string().optional(),
  sourceKey: z.string().optional(),
  denyClose: z.boolean().optional(),
});

export const uiEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(UiEventKind.PushStackItem),
    tabId: z.string().min(1),
    item: dockItemSchema,
  }),
  z.object({
    kind: z.literal(UiEventKind.CloseStack),
    tabId: z.string().min(1),
  }),
  z.object({
    kind: z.literal(UiEventKind.RefreshPageTree),
  }),
  z.object({
    kind: z.literal(UiEventKind.RefreshBasePanel),
    tabId: z.string().min(1),
  }),
]);
