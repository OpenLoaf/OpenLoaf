"use client";

import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";

export type PrimaryPageNavigationInput = {
  baseId: string;
  component: string;
  title: string;
  icon: string;
};

/** Switch to one global primary page without double-writing derived navigation state. */
export function openPrimaryPage(input: PrimaryPageNavigationInput) {
  const view = useAppView.getState();
  const layout = useLayoutState.getState();

  view.setTitle(input.title);
  view.setIcon(input.icon);
  view.setProjectShell(null);
  // 中文注释：退出项目/画布语义时同步清理聊天上下文，避免全局页沿用旧 projectId/boardId。
  view.setChatParams({ projectId: undefined, boardId: undefined });

  layout.setBase({ id: input.baseId, component: input.component });
  layout.clearStack();
  layout.setRightChatCollapsed(true);
}
