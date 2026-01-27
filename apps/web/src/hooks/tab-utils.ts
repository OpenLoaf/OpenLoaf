import type { TabView } from "./tab-types";
import { getLeftSidebarOpen } from "@/lib/sidebar-state";

/** Minimum pixel width for the left dock. */
export const LEFT_DOCK_MIN_PX = 360;

/** Default percent width for the left dock when content exists. */
export const LEFT_DOCK_DEFAULT_PERCENT = 30;

export const BOARD_VIEWER_COMPONENT = "board-viewer";

/** Minimal snapshot needed to resolve active stack items. */
export type TabsStateSnapshot = {
  tabs: TabView[];
  activeStackItemIdByTabId?: Record<string, string>;
};

/** Resolve the active stack item for a tab snapshot. */
export function getActiveStackItem(state: TabsStateSnapshot, tabId: string) {
  const tab = state.tabs.find((item) => item.id === tabId);
  const stack = tab?.stack ?? [];
  const activeId =
    state.activeStackItemIdByTabId?.[tabId] ||
    tab?.activeStackItemId ||
    stack.at(-1)?.id ||
    "";
  return stack.find((item) => item.id === activeId) ?? stack.at(-1);
}

/** Return true when the active board stack is in full mode. */
export function isBoardStackFull(state: TabsStateSnapshot, tabId: string) {
  const activeItem = getActiveStackItem(state, tabId);
  if (activeItem?.component !== BOARD_VIEWER_COMPONENT) return false;
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab?.rightChatCollapsed) return false;
  const leftOpen = getLeftSidebarOpen();
  return leftOpen === false;
}

/** Return true when closing should exit board full mode. */
export function shouldExitBoardFullOnClose(
  state: TabsStateSnapshot,
  tabId: string,
  itemId?: string,
) {
  const activeItem = getActiveStackItem(state, tabId);
  if (!activeItem || activeItem.component !== BOARD_VIEWER_COMPONENT) return false;
  if (itemId && activeItem.id !== itemId) return false;
  return isBoardStackFull(state, tabId);
}

/** Clamp a percent value to [0, 100] with NaN/Infinity fallback. */
export function clampPercent(value: number) {
  // 约束百分比到 [0, 100]，并且对 NaN/Infinity 做兜底。
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Normalize dock layout fields for a tab. */
export function normalizeDock(tab: TabView): TabView {
  // 归一化/修复 Tab 的布局字段：
  // - stack 必须是数组
  // - 没有左侧内容时 leftWidthPercent 强制为 0（左面板彻底隐藏）
  // - 只有在 base 存在时才允许 rightChatCollapsed（避免“空 base 仍折叠右侧”）
  const stack = Array.isArray(tab.stack) ? tab.stack : [];
  const hasLeftContent = Boolean(tab.base) || stack.length > 0;
  const leftWidthPercent = hasLeftContent
    ? clampPercent(tab.leftWidthPercent > 0 ? tab.leftWidthPercent : LEFT_DOCK_DEFAULT_PERCENT)
    : 0;

  return {
    ...tab,
    stack,
    leftWidthPercent,
    rightChatCollapsed: tab.base ? Boolean(tab.rightChatCollapsed) : false,
  };
}

/** Update a tab in-place by id while preserving array immutability. */
export function updateTabById(
  tabs: TabView[],
  tabId: string,
  updater: (tab: TabView) => TabView,
) {
  // immutable 更新指定 tab，保持数组引用变化以触发订阅更新。
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return tabs;
  const nextTabs = [...tabs];
  nextTabs[index] = updater(nextTabs[index]!);
  return nextTabs;
}
