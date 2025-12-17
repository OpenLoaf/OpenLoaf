"use client";

import type { UiEvent } from "@teatime-ai/api/types/event";
import { useTabs } from "@/hooks/use-tabs";
import { queryClient, trpc } from "@/utils/trpc";

// 统一处理后端推送的 UI 事件（data-ui-event）。
// 约定：新增 kind 时，同时更新：
// - packages/api/src/types/event.ts（UiEvent + uiEvents）
// - apps/web/src/lib/chat/ui-event.ts（handlers 分发）
export function handleUiEvent(event: UiEvent | undefined) {
  if (!event?.kind) return;

  // 事件分发表：新增 kind 时，只需要补这里。
  const handlers: Record<UiEvent["kind"], (event: any) => void> = {
    "push-stack-item": (e: Extract<UiEvent, { kind: "push-stack-item" }>) => {
      useTabs.getState().pushStackItem(e.tabId, e.item);
    },
    "close-stack": (e: Extract<UiEvent, { kind: "close-stack" }>) => {
      useTabs.getState().clearStack(e.tabId);
    },
    "refresh-page-tree": (e: Extract<UiEvent, { kind: "refresh-page-tree" }>) => {
      const tab = useTabs.getState().tabs.find((t) => t.id === e.tabId);
      const workspaceId = tab?.workspaceId;
      if (!workspaceId) return;
      const queryKey = trpc.pageCustom.getAll.queryOptions({ workspaceId }).queryKey;
      void queryClient.invalidateQueries({ queryKey });
    },
    "refresh-base-panel": (e: Extract<UiEvent, { kind: "refresh-base-panel" }>) => {
      const state = useTabs.getState();
      const tab = state.tabs.find((t) => t.id === e.tabId);
      const base = tab?.base;
      if (!base) return;

      // 通过改变 params.__refreshKey，触发 LeftDock 中 base 组件 key 变化，从而 remount（相当于“刷新面板”）。
      const current = Number((base.params as any)?.__refreshKey ?? 0);
      state.setTabBase(e.tabId, {
        ...base,
        params: { ...(base.params ?? {}), __refreshKey: current + 1 },
      });
    },
  };

  const handler = handlers[event.kind];
  if (!handler) return;
  handler(event as any);
}

