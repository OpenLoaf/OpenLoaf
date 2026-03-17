"use client";

import type { DockItem } from "@openloaf/api/common";
import { getAppState } from "@/hooks/use-app-state";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState, type LayoutState } from "@/hooks/use-layout-state";
import type { ProjectShellState } from "@/lib/project-shell";

export type PrimaryPageNavigationInput = {
  baseId: string;
  component: string;
  title: string;
  icon: string;
};

export type PrimaryPageNavigationOptions = {
  preserveCurrentView?: boolean;
  baseParams?: Record<string, unknown>;
};

type PrimaryPageLayoutSnapshot = Pick<
  LayoutState,
  | "base"
  | "stack"
  | "leftWidthPercent"
  | "minLeftWidth"
  | "rightChatCollapsed"
  | "rightChatCollapsedSnapshot"
  | "stackHidden"
  | "activeStackItemId"
>;

export type PreviousViewSnapshot = {
  title: string;
  icon: string;
  projectShell: ProjectShellState | null;
  chatSessionId: string;
  chatParams: Record<string, unknown>;
  chatLoadHistory: boolean;
  layout: PrimaryPageLayoutSnapshot;
};

export const PREVIOUS_VIEW_PARAM_KEY = "__previousView";

/** Clone a small serializable snapshot so return navigation won't share mutable references. */
function cloneSerializable<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Capture the current view so a primary page can restore it later from the header back button. */
export function captureCurrentViewSnapshot(): PreviousViewSnapshot {
  const state = getAppState();
  return cloneSerializable({
    title: state.title,
    icon: state.icon,
    projectShell: state.projectShell,
    chatSessionId: state.chatSessionId,
    chatParams: state.chatParams,
    chatLoadHistory: state.chatLoadHistory,
    layout: {
      base: state.base,
      stack: state.stack,
      leftWidthPercent: state.leftWidthPercent,
      minLeftWidth: state.minLeftWidth,
      rightChatCollapsed: state.rightChatCollapsed,
      rightChatCollapsedSnapshot: state.rightChatCollapsedSnapshot,
      stackHidden: state.stackHidden,
      activeStackItemId: state.activeStackItemId,
    },
  });
}

/** Read the previous-view snapshot stored on the current base panel. */
export function resolvePreviousViewSnapshot(base?: DockItem): PreviousViewSnapshot | null {
  const rawSnapshot = base?.params?.[PREVIOUS_VIEW_PARAM_KEY];
  if (!rawSnapshot || typeof rawSnapshot !== "object") return null;
  return cloneSerializable(rawSnapshot as PreviousViewSnapshot);
}

/** Restore the previous captured view from the current base panel. */
export function restorePreviousViewFromBase(base?: DockItem) {
  const snapshot = resolvePreviousViewSnapshot(base ?? useLayoutState.getState().base);
  if (!snapshot) return false;

  // 中文注释：返回时一次性恢复完整视图快照，避免标题、项目上下文、聊天上下文出现“只恢复一半”的状态漂移。
  useAppView.setState({
    chatSessionId: snapshot.chatSessionId,
    chatParams: snapshot.chatParams,
    chatLoadHistory: snapshot.chatLoadHistory,
    projectShell: snapshot.projectShell,
    title: snapshot.title,
    icon: snapshot.icon,
    initialized: true,
  });
  useLayoutState.getState().restoreLayout(snapshot.layout);
  return true;
}

/** Switch to one global primary page without double-writing derived navigation state. */
export function openPrimaryPage(
  input: PrimaryPageNavigationInput,
  options?: PrimaryPageNavigationOptions,
) {
  const view = useAppView.getState();
  const layout = useLayoutState.getState();
  const isSameBase =
    layout.base?.id === input.baseId &&
    layout.base?.component === input.component;
  if (isSameBase && layout.stack.length === 0 && !options?.baseParams) {
    return;
  }
  const nextBaseParams = {
    ...(options?.baseParams ?? {}),
    ...(options?.preserveCurrentView
      ? { [PREVIOUS_VIEW_PARAM_KEY]: captureCurrentViewSnapshot() }
      : {}),
  };

  view.setTitle(input.title);
  view.setIcon(input.icon);
  view.setProjectShell(null);
  // 中文注释：退出项目/画布语义时同步清理聊天上下文，避免全局页沿用旧 projectId/boardId。
  view.setChatParams({ projectId: undefined, boardId: undefined });

  layout.setBase({
    id: input.baseId,
    component: input.component,
    ...(Object.keys(nextBaseParams).length > 0 ? { params: nextBaseParams } : {}),
  });
  layout.clearStack();
  layout.setRightChatCollapsed(true);
}
