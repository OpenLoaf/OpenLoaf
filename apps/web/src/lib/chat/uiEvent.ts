/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import type { UiEvent } from "@openloaf/api/types/event";
import { UiEventKind } from "@openloaf/api/types/event";
import { useLayoutState } from "@/hooks/use-layout-state";
import { getProjectsQueryKey } from "@/hooks/use-projects";
import { queryClient } from "@/utils/trpc";

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
      useLayoutState.getState().pushStackItem(e.item, 70);
    },
    [UiEventKind.CloseStack]: (
      _e: Extract<UiEvent, { kind: UiEventKind.CloseStack }>,
    ) => {
      useLayoutState.getState().clearStack();
    },
    [UiEventKind.RefreshPageTree]: () => {
      const queryKey = getProjectsQueryKey();
      void queryClient.invalidateQueries({ queryKey });
    },
    [UiEventKind.RefreshBasePanel]: (
      _e: Extract<UiEvent, { kind: UiEventKind.RefreshBasePanel }>,
    ) => {
      const layoutState = useLayoutState.getState();
      const base = layoutState.base;
      if (!base) return;

      const current = Number((base.params as any)?.__refreshKey ?? 0);
      layoutState.setBase({
        ...base,
        params: { ...(base.params ?? {}), __refreshKey: current + 1 },
      });
    },
  };

  const handler = handlers[event.kind];
  if (!handler) return;
  handler(event as any);
}
