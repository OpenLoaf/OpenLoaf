"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
  type BrowserTab,
  type DockItem,
  type TerminalTab,
} from "@tenas-ai/api/common";
import { emitSidebarOpenRequest, getLeftSidebarOpen } from "@/lib/sidebar-state";
import { BOARD_VIEWER_COMPONENT, LEFT_DOCK_DEFAULT_PERCENT, clampPercent } from "./tab-utils";
import { isBrowserWindowItem, normalizeBrowserWindowItem } from "./browser-panel";
import { isTerminalWindowItem, normalizeTerminalWindowItem } from "./terminal-panel";
import type { TabRuntime } from "./tab-types";

/** Storage key for tab runtime persistence. */
const TAB_RUNTIME_STORAGE_KEY = "tenas:tab-runtime";

/** Runtime state map for all tabs. */
export type TabRuntimeState = {
  /** Runtime state per tab id. */
  runtimeByTabId: Record<string, TabRuntime>;
  /** Get runtime by tab id. */
  getRuntimeByTabId: (tabId: string) => TabRuntime | undefined;
  /** Update runtime patch for a tab. */
  setRuntimeByTabId: (tabId: string, next: Partial<TabRuntime>) => void;
  /** Clear runtime for a tab. */
  clearRuntimeByTabId: (tabId: string) => void;
  /** Update the base panel for a tab. */
  setTabBase: (tabId: string, base: DockItem | undefined) => void;
  /** Update base params for a tab. */
  setTabBaseParams: (tabId: string, params: Record<string, unknown>) => void;
  /** Update left dock width percent. */
  setTabLeftWidthPercent: (tabId: string, percent: number) => void;
  /** Update left dock minimum width. */
  setTabMinLeftWidth: (tabId: string, minWidth?: number) => void;
  /** Toggle right chat collapsed. */
  setTabRightChatCollapsed: (tabId: string, collapsed: boolean) => void;
  /** Update stack hidden flag. */
  setStackHidden: (tabId: string, hidden: boolean) => void;
  /** Update active stack item id. */
  setActiveStackItemId: (tabId: string, itemId: string) => void;
  /** Push or upsert a stack item. */
  pushStackItem: (tabId: string, item: DockItem, percent?: number) => void;
  /** Remove a stack item. */
  removeStackItem: (tabId: string, itemId: string) => void;
  /** Clear stack items. */
  clearStack: (tabId: string) => void;
  /** Update params for a stack item. */
  setStackItemParams: (tabId: string, itemId: string, params: Record<string, unknown>) => void;
  /** Replace browser tabs in runtime. */
  setBrowserTabs: (tabId: string, tabs: BrowserTab[], activeId?: string) => void;
  /** Replace terminal tabs in runtime. */
  setTerminalTabs: (tabId: string, tabs: TerminalTab[], activeId?: string) => void;
};

const DEFAULT_RUNTIME: TabRuntime = {
  stack: [],
  leftWidthPercent: 0,
  rightChatCollapsed: false,
  stackHidden: false,
  activeStackItemId: "",
};

function normalizeRuntime(input?: TabRuntime): TabRuntime {
  const base = input?.base;
  const stack = Array.isArray(input?.stack) ? input!.stack : [];
  const hasLeftContent = Boolean(base) || stack.length > 0;
  const leftWidthPercent = hasLeftContent
    ? clampPercent(
        Number.isFinite(input?.leftWidthPercent) && (input?.leftWidthPercent ?? 0) > 0
          ? (input?.leftWidthPercent as number)
          : LEFT_DOCK_DEFAULT_PERCENT,
      )
    : 0;
  const minLeftWidth = Number.isFinite(input?.minLeftWidth)
    ? (input?.minLeftWidth as number)
    : undefined;

  return {
    base,
    stack,
    leftWidthPercent,
    minLeftWidth,
    rightChatCollapsed: base ? Boolean(input?.rightChatCollapsed) : false,
    stackHidden: Boolean(input?.stackHidden),
    activeStackItemId:
      typeof input?.activeStackItemId === "string" ? input.activeStackItemId : "",
  };
}

function resolveRuntime(input?: TabRuntime): TabRuntime {
  if (!input) return { ...DEFAULT_RUNTIME };
  return normalizeRuntime(input);
}

/** Normalize runtime records loaded from storage. */
function normalizeRuntimeByTabId(input: unknown): Record<string, TabRuntime> {
  if (!input || typeof input !== "object") return {};
  const record = input as Record<string, TabRuntime>;
  const next: Record<string, TabRuntime> = {};
  for (const [tabId, runtime] of Object.entries(record)) {
    if (!tabId) continue;
    next[tabId] = normalizeRuntime(runtime);
  }
  return next;
}

function getActiveStackItem(runtime: TabRuntime) {
  const stack = runtime.stack ?? [];
  const activeId = runtime.activeStackItemId || stack.at(-1)?.id || "";
  return stack.find((item) => item.id === activeId) ?? stack.at(-1);
}

function isBoardStackFull(runtime: TabRuntime) {
  const activeItem = getActiveStackItem(runtime);
  if (activeItem?.component !== BOARD_VIEWER_COMPONENT) return false;
  if (!runtime.rightChatCollapsed) return false;
  const leftOpen = getLeftSidebarOpen();
  return leftOpen === false;
}

function shouldExitBoardFullOnClose(runtime: TabRuntime, itemId?: string) {
  const activeItem = getActiveStackItem(runtime);
  if (!activeItem || activeItem.component !== BOARD_VIEWER_COMPONENT) return false;
  if (itemId && activeItem.id !== itemId) return false;
  return isBoardStackFull(runtime);
}

export const useTabRuntime = create<TabRuntimeState>()(
  persist(
    (set, get) => ({
      runtimeByTabId: {},
      getRuntimeByTabId: (tabId) => get().runtimeByTabId[tabId],
      setRuntimeByTabId: (tabId, next) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextRuntime = normalizeRuntime({ ...current, ...next });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      clearRuntimeByTabId: (tabId) => {
        set((state) => {
          if (!state.runtimeByTabId[tabId]) return state;
          const next = { ...state.runtimeByTabId };
          delete next[tabId];
          return { runtimeByTabId: next };
        });
      },
      setTabBase: (tabId, base) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextRuntime = normalizeRuntime({ ...current, base });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setTabBaseParams: (tabId, params) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          if (!current.base) return state;
          const currentParams = (current.base.params ?? {}) as Record<string, unknown>;
          const nextParams = { ...currentParams, ...params };
          const same =
            Object.keys(nextParams).length === Object.keys(currentParams).length &&
            Object.entries(nextParams).every(([key, value]) => currentParams[key] === value);
          if (same) return state;

          const nextRuntime = normalizeRuntime({
            ...current,
            base: { ...current.base, params: nextParams },
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setTabLeftWidthPercent: (tabId, percent) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const hasLeftContent = Boolean(current.base) || current.stack.length > 0;
          const nextPercent = hasLeftContent ? clampPercent(percent) : 0;
          const nextRuntime = normalizeRuntime({
            ...current,
            leftWidthPercent: nextPercent,
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setTabMinLeftWidth: (tabId, minWidth) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextRuntime = normalizeRuntime({
            ...current,
            minLeftWidth: Number.isFinite(minWidth) ? minWidth : undefined,
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setTabRightChatCollapsed: (tabId, collapsed) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextRuntime = normalizeRuntime({
            ...current,
            rightChatCollapsed: current.base ? collapsed : false,
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setStackHidden: (tabId, hidden) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextRuntime = normalizeRuntime({
            ...current,
            stackHidden: Boolean(hidden),
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setActiveStackItemId: (tabId, itemId) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextRuntime = normalizeRuntime({
            ...current,
            activeStackItemId: itemId,
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      pushStackItem: (tabId, item, percent) => {
        let shouldRestoreFull = false;
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const wasHidden = Boolean(current.stackHidden);
          shouldRestoreFull =
            wasHidden &&
            item.component === BOARD_VIEWER_COMPONENT &&
            Boolean((item.params as any)?.__boardFull);
          // 中文注释：如果之前是最小化状态，标记本次打开用于关闭时恢复隐藏。
          const nextItem = wasHidden
            ? {
                ...item,
                params: { ...(item.params ?? {}), __restoreStackHidden: true },
              }
            : item;

          const isBrowser = nextItem.component === BROWSER_WINDOW_COMPONENT;
          const isTerminal = nextItem.component === TERMINAL_WINDOW_COMPONENT;
          const activeId = isBrowser
            ? BROWSER_WINDOW_PANEL_ID
            : isTerminal
              ? TERMINAL_WINDOW_PANEL_ID
              : nextItem.id;

          const key = isBrowser
            ? BROWSER_WINDOW_PANEL_ID
            : isTerminal
              ? TERMINAL_WINDOW_PANEL_ID
              : (nextItem.sourceKey ?? nextItem.id);
          const existingIndex = current.stack.findIndex((s) =>
            isBrowser
              ? s.component === BROWSER_WINDOW_COMPONENT
              : isTerminal
                ? s.component === TERMINAL_WINDOW_COMPONENT
                : (s.sourceKey ?? s.id) === key,
          );
          const existing = existingIndex === -1 ? undefined : current.stack[existingIndex];

          const normalizedItem = isBrowser
            ? normalizeBrowserWindowItem(
                isBrowserWindowItem(existing) ? existing : undefined,
                {
                  ...nextItem,
                  id: BROWSER_WINDOW_PANEL_ID,
                  sourceKey: BROWSER_WINDOW_PANEL_ID,
                },
              )
            : isTerminal
              ? normalizeTerminalWindowItem(
                  isTerminalWindowItem(existing) ? existing : undefined,
                  {
                    ...nextItem,
                    id: TERMINAL_WINDOW_PANEL_ID,
                    sourceKey: TERMINAL_WINDOW_PANEL_ID,
                  },
                )
              : nextItem;

          const nextStack = [...current.stack];
          if (existingIndex === -1) nextStack.push(normalizedItem);
          else {
            nextStack[existingIndex] = isBrowser
              ? normalizedItem
              : { ...nextStack[existingIndex]!, ...nextItem };
          }

          const normalizedStack = isBrowser
            ? [
                ...nextStack.filter((s) => s.component !== BROWSER_WINDOW_COMPONENT),
                normalizedItem,
              ]
            : isTerminal
              ? [
                  ...nextStack.filter((s) => s.component !== TERMINAL_WINDOW_COMPONENT),
                  normalizedItem,
                ]
              : nextStack;

          const nextRuntime = normalizeRuntime({
            ...current,
            stack: normalizedStack,
            activeStackItemId: activeId,
            stackHidden: false,
            leftWidthPercent: clampPercent(
              Number.isFinite(percent)
                ? percent!
                : current.leftWidthPercent > 0
                  ? current.leftWidthPercent
                  : LEFT_DOCK_DEFAULT_PERCENT,
            ),
            // 中文注释：恢复画布全屏时同步收起右侧面板，避免恢复后宽度闪动。
            rightChatCollapsed: shouldRestoreFull ? true : current.rightChatCollapsed,
          });

          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
        if (shouldRestoreFull) {
          // 逻辑：恢复画布全屏时同步收起左侧栏。
          emitSidebarOpenRequest(false);
        }
      },
      removeStackItem: (tabId, itemId) => {
        let shouldExitFull = false;
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          shouldExitFull = shouldExitBoardFullOnClose(current, itemId);
          const targetItem = current.stack.find((item) => item.id === itemId);
          const nextStack = current.stack.filter((item) => item.id !== itemId);
          const shouldRestoreHidden = Boolean(
            (targetItem?.params as any)?.__restoreStackHidden,
          );
          const currentActiveId = current.activeStackItemId ?? "";
          const nextActiveId =
            currentActiveId && currentActiveId !== itemId
              ? currentActiveId
              : (nextStack.at(-1)?.id ?? "");

          const nextRuntime = normalizeRuntime({
            ...current,
            stack: nextStack,
            activeStackItemId: nextActiveId,
            stackHidden:
              nextStack.length === 0
                ? false
                : shouldRestoreHidden
                  ? true
                  : current.stackHidden,
            rightChatCollapsed: shouldExitFull ? false : current.rightChatCollapsed,
          });

          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
        if (shouldExitFull) {
          // 逻辑：关闭画布 stack 时退出全屏模式，恢复左右栏。
          emitSidebarOpenRequest(true);
        }
      },
      clearStack: (tabId) => {
        let shouldExitFull = false;
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          shouldExitFull = shouldExitBoardFullOnClose(current);
          const nextRuntime = normalizeRuntime({
            ...current,
            stack: [],
            activeStackItemId: "",
            stackHidden: false,
            rightChatCollapsed: shouldExitFull ? false : current.rightChatCollapsed,
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
        if (shouldExitFull) {
          // 逻辑：关闭全部 stack 时退出全屏模式，恢复左右栏。
          emitSidebarOpenRequest(true);
        }
      },
      setStackItemParams: (tabId, itemId, params) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const stack = current.stack ?? [];
          const itemIndex = stack.findIndex((item) => item.id === itemId);
          if (itemIndex === -1) return state;
          const target = stack[itemIndex]!;
          const currentParams = (target.params ?? {}) as Record<string, unknown>;
          const nextParams = { ...currentParams, ...params };
          const same =
            Object.keys(nextParams).length === Object.keys(currentParams).length &&
            Object.entries(nextParams).every(([key, value]) => currentParams[key] === value);
          if (same) return state;

          const nextStack = [...stack];
          nextStack[itemIndex] = { ...target, params: nextParams };
          const nextRuntime = normalizeRuntime({ ...current, stack: nextStack });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setBrowserTabs: (tabId, tabs, activeId) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextTabs = Array.isArray(tabs) ? tabs : [];
          const nextActiveId =
            typeof activeId === "string" ? activeId : nextTabs[0]?.id ?? "";
          const nextStack = current.stack.filter(
            (item) => item.component !== BROWSER_WINDOW_COMPONENT,
          );
          // 中文注释：直接替换浏览器面板状态，避免 merge 造成“关闭又回滚”。
          nextStack.push(
            normalizeBrowserWindowItem(undefined, {
              id: BROWSER_WINDOW_PANEL_ID,
              sourceKey: BROWSER_WINDOW_PANEL_ID,
              component: BROWSER_WINDOW_COMPONENT,
              params: {
                __customHeader: true,
                browserTabs: nextTabs,
                activeBrowserTabId: nextActiveId,
              },
            } as DockItem),
          );
          const nextRuntime = normalizeRuntime({
            ...current,
            stack: nextStack,
            activeStackItemId: BROWSER_WINDOW_PANEL_ID,
            stackHidden: false,
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
      setTerminalTabs: (tabId, tabs, activeId) => {
        set((state) => {
          const current = resolveRuntime(state.runtimeByTabId[tabId]);
          const nextTabs = Array.isArray(tabs) ? tabs : [];
          const nextActiveId =
            typeof activeId === "string" ? activeId : nextTabs[0]?.id ?? "";
          const nextStack = current.stack.filter(
            (item) => item.component !== TERMINAL_WINDOW_COMPONENT,
          );
          // 中文注释：直接替换终端面板状态，避免 merge 造成“关闭又回滚”。
          nextStack.push(
            normalizeTerminalWindowItem(undefined, {
              id: TERMINAL_WINDOW_PANEL_ID,
              sourceKey: TERMINAL_WINDOW_PANEL_ID,
              component: TERMINAL_WINDOW_COMPONENT,
              params: {
                __customHeader: true,
                terminalTabs: nextTabs,
                activeTerminalTabId: nextActiveId,
              },
            } as DockItem),
          );
          const nextRuntime = normalizeRuntime({
            ...current,
            stack: nextStack,
            activeStackItemId: TERMINAL_WINDOW_PANEL_ID,
            stackHidden: false,
          });
          return {
            runtimeByTabId: { ...state.runtimeByTabId, [tabId]: nextRuntime },
          };
        });
      },
    }),
    {
      name: TAB_RUNTIME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ runtimeByTabId: state.runtimeByTabId }),
      // 逻辑：恢复持久化的 runtime，避免刷新后左侧面板/stack 丢失。
      merge: (persisted, current) => ({
        ...current,
        runtimeByTabId: normalizeRuntimeByTabId(
          (persisted as Partial<TabRuntimeState>)?.runtimeByTabId,
        ),
      }),
    },
  ),
);
