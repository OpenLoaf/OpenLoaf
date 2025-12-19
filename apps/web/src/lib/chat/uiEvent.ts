"use client";

import type { UiEvent } from "@teatime-ai/api/types/event";
import { UiEventKind } from "@teatime-ai/api/types/event";
import { useTabs } from "@/hooks/use-tabs";
import { queryClient, trpc } from "@/utils/trpc";

/**
 * UI 事件分发器（传输层无关）。
 * - 说明：不关心事件来自 Electron IPC / 未来的 WS / 其它通道，只负责把 UiEvent 应用到本地 UI 状态。
 */
export function handleUiEvent(event: UiEvent | undefined) {
  if (!event?.kind) return;

  const handlers: Record<UiEvent["kind"], (event: any) => void> = {
    [UiEventKind.PushStackItem]: (
      e: Extract<UiEvent, { kind: UiEventKind.PushStackItem }>,
    ) => {
      useTabs.getState().pushStackItem(e.tabId, e.item, 100);
    },
    [UiEventKind.CloseStack]: (
      e: Extract<UiEvent, { kind: UiEventKind.CloseStack }>,
    ) => {
      useTabs.getState().clearStack(e.tabId);
    },
    [UiEventKind.RefreshPageTree]: () => {
      const state = useTabs.getState();
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      const workspaceId = tab?.workspaceId;
      if (!workspaceId) return;
      const queryKey = trpc.pageCustom.getAll.queryOptions({ workspaceId }).queryKey;
      void queryClient.invalidateQueries({ queryKey });
    },
    [UiEventKind.RefreshBasePanel]: (
      e: Extract<UiEvent, { kind: UiEventKind.RefreshBasePanel }>,
    ) => {
      const state = useTabs.getState();
      const tab = state.tabs.find((t) => t.id === e.tabId);
      const base = tab?.base;
      if (!base) return;

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

