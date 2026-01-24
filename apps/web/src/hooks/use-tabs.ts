"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  DEFAULT_TAB_INFO,
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
  type BrowserTab,
  type DockItem,
  type Tab,
  type TerminalTab,
} from "@tenas-ai/api/common";
import { createChatSessionId } from "@/lib/chat-session-id";
import { emitSidebarOpenRequest } from "@/lib/sidebar-state";
import {
  BOARD_VIEWER_COMPONENT,
  LEFT_DOCK_DEFAULT_PERCENT,
  LEFT_DOCK_MIN_PX,
  clampPercent,
  normalizeDock,
  shouldExitBoardFullOnClose,
  updateTabById,
} from "@/hooks/tab-utils";
import { isBrowserWindowItem, normalizeBrowserWindowItem } from "@/hooks/browser-panel";
import { isTerminalWindowItem, normalizeTerminalWindowItem } from "@/hooks/terminal-panel";

export const TABS_STORAGE_KEY = "tenas:tabs";
export { LEFT_DOCK_DEFAULT_PERCENT, LEFT_DOCK_MIN_PX };

export type ToolPartSnapshot = {
  /** Rendering variant for tool cards. */
  variant?: string;
  type: string;
  toolCallId?: string;
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /** Tool approval status. */
  approval?: { id?: string; approved?: boolean; reason?: string };
};

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

type AddTabInput = {
  workspaceId: string; // 所属工作区ID
  title?: string; // 标签页标题
  icon?: string; // 标签页图标
  isPin?: boolean; // 是否固定标签页
  createNew?: boolean; // 是否强制创建新标签页
  base?: DockItem; // 基础面板内容
  leftWidthPercent?: number; // 左侧面板宽度百分比
  rightChatCollapsed?: boolean; // 右侧聊天栏是否折叠
  chatSessionId?: string; // 聊天会话ID
  chatParams?: Record<string, unknown>; // 聊天参数
  chatLoadHistory?: boolean; // 是否加载聊天历史
};

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  /** 当前 tab 的 stack 是否被最小化（隐藏） */
  stackHiddenByTabId: Record<string, boolean>;

  /** 当前 tab 的激活 stack item（不再通过“重排数组”来表示选中态） */
  activeStackItemIdByTabId: Record<string, string>;

  /** 运行时缓存：工具调用片段（不落盘，避免 localStorage 过大/频繁写入）。 */
  toolPartsByTabId: Record<string, Record<string, ToolPartSnapshot>>;

  /** 运行时缓存：每个 tab 的 chat 状态（用于 Header Tabs 等 UI 提示）。 */
  chatStatusByTabId: Record<string, ChatStatus>;
  /** 运行时缓存：语音输入状态（用于 Tab 彩虹边框提示）。 */
  dictationStatusByTabId: Record<string, boolean>;

  addTab: (input: AddTabInput) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  getTabById: (tabId: string) => Tab | undefined;
  getWorkspaceTabs: (workspaceId: string) => Tab[];
  reorderTabs: (
    workspaceId: string,
    sourceTabId: string,
    targetTabId: string,
    position?: "before" | "after",
  ) => void;
  setTabPinned: (tabId: string, isPin: boolean) => void;
  setTabTitle: (tabId: string, title: string) => void;
  /** Update tab icon. */
  setTabIcon: (tabId: string, icon?: string | null) => void;

  setTabBase: (tabId: string, base: DockItem | undefined) => void;
  /**
   * Update base params for a tab.
   */
  setTabBaseParams: (tabId: string, params: Record<string, unknown>) => void;
  setTabLeftWidthPercent: (tabId: string, percent: number) => void;
  setTabMinLeftWidth: (tabId: string, minWidth?: number) => void;
  setTabRightChatCollapsed: (tabId: string, collapsed: boolean) => void;
  setTabChatSession: (
    tabId: string,
    chatSessionId: string,
    options?: { loadHistory?: boolean },
  ) => void;

  /**
   * Update runtime chat status for a tab.
   */
  setTabChatStatus: (tabId: string, status: ChatStatus | null) => void;
  /**
   * Update runtime dictation status for a tab.
   */
  setTabDictationStatus: (tabId: string, isListening: boolean) => void;

  pushStackItem: (tabId: string, item: DockItem, percent?: number) => void;
  removeStackItem: (tabId: string, itemId: string) => void;
  clearStack: (tabId: string) => void;
  setStackHidden: (tabId: string, hidden: boolean) => void;
  /** Update params for a stack item. */
  setStackItemParams: (tabId: string, itemId: string, params: Record<string, unknown>) => void;
  /**
   * Replace browser tabs state for the embedded browser panel.
   */
  setBrowserTabs: (tabId: string, tabs: BrowserTab[], activeId?: string) => void;
  /**
   * Replace terminal tabs state for the terminal panel.
   */
  setTerminalTabs: (tabId: string, tabs: TerminalTab[], activeId?: string) => void;

  upsertToolPart: (tabId: string, key: string, part: ToolPartSnapshot) => void;
  clearToolPartsForTab: (tabId: string) => void;
}

function generateId(prefix = "id") {
  // 生成稳定的本地 ID：优先 randomUUID，降级到时间戳 + 随机数。
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function orderWorkspaceTabs(tabs: Tab[]) {
  // 固定标签始终排在前面；普通标签保持相对顺序。
  const pinned: Tab[] = [];
  const regular: Tab[] = [];

  for (const tab of tabs) {
    if (tab.isPin) pinned.push(tab);
    else regular.push(tab);
  }

  return [...pinned, ...regular];
}

export const useTabs = create<TabsState>()(
  persist(
    (set, get): TabsState => ({
      tabs: [],
      activeTabId: null,
      stackHiddenByTabId: {},
      activeStackItemIdByTabId: {},
      toolPartsByTabId: {},
      chatStatusByTabId: {},
      dictationStatusByTabId: {},

      addTab: (input) => {
        set((state) => {
          // 新建标签：同时创建一个 chatSessionId（即使右侧暂时折叠）。
          const now = Date.now();
          const {
            createNew = false,
            workspaceId,
            base,
            title,
            icon,
            isPin,
            leftWidthPercent,
            rightChatCollapsed,
            chatSessionId: requestedChatSessionId,
            chatParams,
            chatLoadHistory,
          } = input;

          const normalizedBase = base?.component === "ai-chat" ? undefined : base;

          const tabId = generateId("tab");
          const createdChatSessionId = requestedChatSessionId ?? createChatSessionId();
          const createdChatLoadHistory = chatLoadHistory ?? Boolean(requestedChatSessionId);

          const nextTab = normalizeDock({
            id: tabId,
            workspaceId,
            title: title ?? DEFAULT_TAB_INFO.title,
            icon: icon ?? DEFAULT_TAB_INFO.icon,
            isPin: isPin ?? false,
            chatSessionId: createdChatSessionId,
            chatParams,
            chatLoadHistory: createdChatLoadHistory,
            rightChatCollapsed: rightChatCollapsed ?? false,
            base: normalizedBase,
            stack: [],
            leftWidthPercent: normalizedBase
              ? clampPercent(
                  Number.isFinite(leftWidthPercent)
                    ? leftWidthPercent!
                    : LEFT_DOCK_DEFAULT_PERCENT,
                )
              : 0,
            createdAt: now,
            lastActiveAt: now,
          });

          return {
            tabs: [...state.tabs, nextTab],
            activeTabId: nextTab.id,
            stackHiddenByTabId: { ...state.stackHiddenByTabId, [nextTab.id]: false },
            activeStackItemIdByTabId: { ...state.activeStackItemIdByTabId },
          };
        });
      },

      closeTab: (tabId) => {
        set((state) => {
          // 关闭标签规则：
          // - 固定标签不可关闭
          // - 工作区至少保留 1 个标签
          // - 如果关闭的是当前激活标签，回退到该工作区 lastActiveAt 最新的标签
          const tabToClose = state.tabs.find((tab) => tab.id === tabId);
          if (!tabToClose || tabToClose.isPin) return state;

          const workspaceTabs = state.tabs.filter((tab) => tab.workspaceId === tabToClose.workspaceId);
          if (workspaceTabs.length <= 1) return state;

          const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
          const nextToolPartsByTabId = { ...state.toolPartsByTabId };
          delete nextToolPartsByTabId[tabId];
          const nextChatStatusByTabId = { ...state.chatStatusByTabId };
          delete nextChatStatusByTabId[tabId];
          const nextDictationStatusByTabId = { ...state.dictationStatusByTabId };
          delete nextDictationStatusByTabId[tabId];
          const nextHidden = { ...state.stackHiddenByTabId };
          delete nextHidden[tabId];
          const nextActiveStack = { ...state.activeStackItemIdByTabId };
          delete nextActiveStack[tabId];
          let nextActiveTabId = state.activeTabId;
          if (state.activeTabId === tabId) {
            const remaining = nextTabs.filter((tab) => tab.workspaceId === tabToClose.workspaceId);
            const fallback =
              remaining.reduce<Tab | null>(
                (best, tab) => (!best || tab.lastActiveAt > best.lastActiveAt ? tab : best),
                null,
              ) ?? null;
            nextActiveTabId = fallback?.id ?? null;
          }

          return {
            tabs: nextTabs,
            activeTabId: nextActiveTabId,
            toolPartsByTabId: nextToolPartsByTabId,
            chatStatusByTabId: nextChatStatusByTabId,
            dictationStatusByTabId: nextDictationStatusByTabId,
            stackHiddenByTabId: nextHidden,
            activeStackItemIdByTabId: nextActiveStack,
          };
        });
      },

      setActiveTab: (tabId) => {
        set((state) => {
          // 激活标签：更新 lastActiveAt，供 closeTab 做“最近使用”回退。
          const existing = state.tabs.find((tab) => tab.id === tabId);
          if (!existing) return state;
          const now = Date.now();
          const nextTabs = updateTabById(state.tabs, tabId, (tab) => ({ ...tab, lastActiveAt: now }));
          return { tabs: nextTabs, activeTabId: tabId };
        });
      },

      getTabById: (tabId) => get().tabs.find((tab) => tab.id === tabId),

      getWorkspaceTabs: (workspaceId) =>
        orderWorkspaceTabs(get().tabs.filter((tab) => tab.workspaceId === workspaceId)),

      reorderTabs: (workspaceId, sourceTabId, targetTabId, position = "before") => {
        set((state) => {
          // 拖拽排序：
          // - 固定区/非固定区各自独立排序，禁止跨区混排
          // - position 控制插入到目标前/后
          if (sourceTabId === targetTabId) return state;

          const workspaceTabs = orderWorkspaceTabs(state.tabs.filter((tab) => tab.workspaceId === workspaceId));
          const pinnedCount = workspaceTabs.filter((tab) => tab.isPin).length;

          const fromIndex = workspaceTabs.findIndex((tab) => tab.id === sourceTabId);
          const toIndex = workspaceTabs.findIndex((tab) => tab.id === targetTabId);
          if (fromIndex === -1 || toIndex === -1) return state;

          const sourcePinned = Boolean(workspaceTabs[fromIndex]?.isPin);
          const targetPinned = Boolean(workspaceTabs[toIndex]?.isPin);

          const reordered = [...workspaceTabs];
          const [moved] = reordered.splice(fromIndex, 1);
          let targetIndex = toIndex;

          if (fromIndex < toIndex) targetIndex -= 1;
          if (position === "after") targetIndex += 1;

          if (sourcePinned && !targetPinned) {
            // 固定标签不能被拖到非固定区
            targetIndex = Math.min(targetIndex, Math.max(0, pinnedCount - 1));
          } else if (!sourcePinned && targetPinned) {
            // 非固定标签不能被拖到固定区
            targetIndex = Math.max(targetIndex, pinnedCount);
          }

          const lowerBound = sourcePinned ? 0 : pinnedCount;
          const upperBound = sourcePinned ? Math.max(pinnedCount - 1, 0) : reordered.length;
          const boundedIndex = Math.max(lowerBound, Math.min(targetIndex, upperBound));
          reordered.splice(boundedIndex, 0, moved!);

          const workspaceQueue = [...reordered];
          const nextTabs = state.tabs.map((tab) =>
            tab.workspaceId !== workspaceId ? tab : (workspaceQueue.shift() as Tab),
          );

          return { tabs: nextTabs };
        });
      },

      setTabPinned: (tabId, isPin) => {
        set((state) => {
          const target = state.tabs.find((tab) => tab.id === tabId);
          if (!target) return state;

          const updatedTabs = state.tabs.map((tab) => (tab.id === tabId ? { ...tab, isPin } : tab));

          const workspaceTabs = orderWorkspaceTabs(updatedTabs.filter((tab) => tab.workspaceId === target.workspaceId));
          const workspaceQueue = [...workspaceTabs];
          const nextTabs = updatedTabs.map((tab) =>
            tab.workspaceId !== target.workspaceId ? tab : (workspaceQueue.shift() as Tab),
          );

          return { tabs: nextTabs };
        });
      },

      setTabTitle: (tabId, title) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              title,
            }),
          ),
        }));
      },
      setTabIcon: (tabId, icon) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              icon: icon ?? DEFAULT_TAB_INFO.icon,
            }),
          ),
        }));
      },

      setTabBase: (tabId, base) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              base,
              // 当首次设置 base 时，如果之前 leftWidthPercent 为 0，则给一个默认宽度（让左栏出现）。
              leftWidthPercent: base ? tab.leftWidthPercent || LEFT_DOCK_DEFAULT_PERCENT : tab.leftWidthPercent,
            }),
          ),
        }));
      },

      /** Update dock base params for a tab. */
      setTabBaseParams: (tabId, params) => {
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === tabId);
          if (index === -1) return state;
          const target = state.tabs[index];
          if (!target?.base) return state;

          const currentParams = (target.base.params ?? {}) as Record<string, unknown>;
          const nextParams = { ...currentParams, ...params };
          // 只在参数变化时更新，避免重复写入触发持久化。
          const same =
            Object.keys(nextParams).length === Object.keys(currentParams).length &&
            Object.entries(nextParams).every(([key, value]) => currentParams[key] === value);
          if (same) return state;

          const nextTabs = [...state.tabs];
          nextTabs[index] = normalizeDock({
            ...target,
            base: {
              ...target.base,
              params: nextParams,
            },
          });

          return { tabs: nextTabs };
        });
      },

      setTabLeftWidthPercent: (tabId, percent) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              leftWidthPercent: clampPercent(percent),
            }),
          ),
        }));
      },

      setTabMinLeftWidth: (tabId, minWidth) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              minLeftWidth: minWidth,
            }),
          ),
        }));
      },

      setTabRightChatCollapsed: (tabId, collapsed) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              rightChatCollapsed: tab.base ? collapsed : false,
            }),
          ),
        }));
      },

      setTabChatSession: (tabId, chatSessionId, options) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              chatSessionId,
              // loadHistory 是一次性的“下一次是否补历史”的开关，由 Chat 侧消费。
              chatLoadHistory: options?.loadHistory,
              // 切换 chatSession 时保留左侧 stack 和隐藏状态，避免整页级刷新感。
            }),
          ),
        }));
      },

      setTabChatStatus: (tabId, status) => {
        set((state) => {
          const current = state.chatStatusByTabId[tabId];
          if (status === null) {
            if (!current) return state;
            const next = { ...state.chatStatusByTabId };
            delete next[tabId];
            return { chatStatusByTabId: next };
          }
          if (current === status) return state;
          return { chatStatusByTabId: { ...state.chatStatusByTabId, [tabId]: status } };
        });
      },
      setTabDictationStatus: (tabId, isListening) => {
        set((state) => {
          const current = state.dictationStatusByTabId[tabId];
          if (!isListening) {
            if (!current) return state;
            const next = { ...state.dictationStatusByTabId };
            delete next[tabId];
            return { dictationStatusByTabId: next };
          }
          if (current) return state;
          return { dictationStatusByTabId: { ...state.dictationStatusByTabId, [tabId]: true } };
        });
      },

      pushStackItem: (tabId, item, percent) => {
        let shouldRestoreFull = false;
        set((state) => {
          const wasHidden = Boolean(state.stackHiddenByTabId[tabId]);
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
          // 打开/切换 stack 时自动解除“最小化隐藏”。
          const nextHidden = { ...state.stackHiddenByTabId, [tabId]: false };

          const isBrowser = nextItem.component === BROWSER_WINDOW_COMPONENT;
          const isTerminal = nextItem.component === TERMINAL_WINDOW_COMPONENT;
          const activeId = isBrowser
            ? BROWSER_WINDOW_PANEL_ID
            : isTerminal
              ? TERMINAL_WINDOW_PANEL_ID
              : nextItem.id;

          return {
            stackHiddenByTabId: nextHidden,
            // 选中态用单独字段保存，不再通过“把 item 移到数组末尾”来表示顶部。
            activeStackItemIdByTabId: { ...state.activeStackItemIdByTabId, [tabId]: activeId },
            tabs: updateTabById(state.tabs, tabId, (tab) => {
              // 左侧 stack：同 sourceKey/id 视为同一条目（upsert），用于“同一个来源的面板重复打开”。
              const nextTab = normalizeDock(tab);
              const key = isBrowser
                ? BROWSER_WINDOW_PANEL_ID
                : isTerminal
                  ? TERMINAL_WINDOW_PANEL_ID
                  : (nextItem.sourceKey ?? nextItem.id);
              const existingIndex = nextTab.stack.findIndex((s) =>
                isBrowser
                  ? s.component === BROWSER_WINDOW_COMPONENT
                  : isTerminal
                    ? s.component === TERMINAL_WINDOW_COMPONENT
                    : (s.sourceKey ?? s.id) === key,
              );

              const existing = existingIndex === -1 ? undefined : nextTab.stack[existingIndex];
              const normalizedItem = isBrowser
                ? normalizeBrowserWindowItem(isBrowserWindowItem(existing) ? existing : undefined, {
                    ...nextItem,
                    id: BROWSER_WINDOW_PANEL_ID,
                    sourceKey: BROWSER_WINDOW_PANEL_ID,
                  })
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

              const nextStack = [...nextTab.stack];
              if (existingIndex === -1) nextStack.push(normalizedItem);
              else {
                nextStack[existingIndex] = isBrowser
                  ? normalizedItem
                  : { ...nextStack[existingIndex]!, ...nextItem };
              }

              return normalizeDock({
                ...nextTab,
                // 每个 Tab 的 stack 中只允许一个 browser/terminal 窗口面板。
                stack: isBrowser
                  ? [...nextStack.filter((s) => s.component !== BROWSER_WINDOW_COMPONENT), normalizedItem]
                  : isTerminal
                    ? [
                        ...nextStack.filter((s) => s.component !== TERMINAL_WINDOW_COMPONENT),
                        normalizedItem,
                      ]
                    : nextStack,
                // 打开 stack 时自动撑开左栏：如果传了 percent 用它，否则保持原值/回退默认值。
                leftWidthPercent: clampPercent(
                  Number.isFinite(percent)
                    ? percent!
                    : nextTab.leftWidthPercent > 0
                      ? nextTab.leftWidthPercent
                      : LEFT_DOCK_DEFAULT_PERCENT,
                ),
                // 中文注释：恢复画布全屏时同步收起右侧面板，避免恢复后宽度闪动。
                rightChatCollapsed: shouldRestoreFull
                  ? true
                  : nextTab.rightChatCollapsed,
              });
            }),
          };
        });
        if (shouldRestoreFull) {
          // 逻辑：恢复画布全屏时同步收起左侧栏。
          emitSidebarOpenRequest(false);
        }
      },

      setBrowserTabs: (tabId, tabs, activeId) => {
        set((state) => {
          const nextTabs = Array.isArray(tabs) ? tabs : [];
          const nextActiveId =
            typeof activeId === "string" ? activeId : nextTabs[0]?.id ?? "";
          return {
            tabs: updateTabById(state.tabs, tabId, (tab) => {
              const nextTab = normalizeDock(tab);
              const nextStack = (nextTab.stack ?? []).filter(
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
              return normalizeDock({
                ...nextTab,
                stack: nextStack,
              });
            }),
            activeStackItemIdByTabId: {
              ...state.activeStackItemIdByTabId,
              [tabId]: BROWSER_WINDOW_PANEL_ID,
            },
            stackHiddenByTabId: { ...state.stackHiddenByTabId, [tabId]: false },
          };
        });
      },

      setTerminalTabs: (tabId, tabs, activeId) => {
        set((state) => {
          const nextTabs = Array.isArray(tabs) ? tabs : [];
          const nextActiveId =
            typeof activeId === "string" ? activeId : nextTabs[0]?.id ?? "";
          return {
            tabs: updateTabById(state.tabs, tabId, (tab) => {
              const nextTab = normalizeDock(tab);
              const nextStack = (nextTab.stack ?? []).filter(
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
              return normalizeDock({
                ...nextTab,
                stack: nextStack,
              });
            }),
            activeStackItemIdByTabId: {
              ...state.activeStackItemIdByTabId,
              [tabId]: TERMINAL_WINDOW_PANEL_ID,
            },
            stackHiddenByTabId: { ...state.stackHiddenByTabId, [tabId]: false },
          };
        });
      },

      removeStackItem: (tabId, itemId) => {
        const shouldExitFull = shouldExitBoardFullOnClose(get(), tabId, itemId);
        if (shouldExitFull) {
          // 逻辑：关闭画布 stack 时退出全屏模式，恢复左右栏。
          emitSidebarOpenRequest(true);
        }
        set((state) => {
          const current = state.tabs.find((t) => t.id === tabId);
          const targetItem = (current?.stack ?? []).find((item) => item.id === itemId);
          const nextStack = (current?.stack ?? []).filter((item) => item.id !== itemId);
          const shouldRestoreHidden = Boolean(
            (targetItem?.params as any)?.__restoreStackHidden
          );
          const currentActiveId = String(state.activeStackItemIdByTabId[tabId] ?? "");
          const nextActiveId =
            currentActiveId && currentActiveId !== itemId
              ? currentActiveId
              : (nextStack.at(-1)?.id ?? "");
          return {
            stackHiddenByTabId: {
              ...state.stackHiddenByTabId,
              // 中文注释：仅在“由最小化状态打开的面板”关闭时恢复隐藏。
              [tabId]:
                nextStack.length === 0
                  ? false
                  : shouldRestoreHidden
                    ? true
                    : state.stackHiddenByTabId[tabId],
            },
            activeStackItemIdByTabId: { ...state.activeStackItemIdByTabId, [tabId]: nextActiveId },
            tabs: updateTabById(state.tabs, tabId, (tab) =>
              normalizeDock({
                ...tab,
                stack: (tab.stack ?? []).filter((item) => item.id !== itemId),
                rightChatCollapsed: shouldExitFull ? false : tab.rightChatCollapsed,
              }),
            ),
          };
        });
      },

      clearStack: (tabId) => {
        const shouldExitFull = shouldExitBoardFullOnClose(get(), tabId);
        if (shouldExitFull) {
          // 逻辑：关闭全部 stack 时退出全屏模式，恢复左右栏。
          emitSidebarOpenRequest(true);
        }
        set((state) => ({
          stackHiddenByTabId: { ...state.stackHiddenByTabId, [tabId]: false },
          activeStackItemIdByTabId: { ...state.activeStackItemIdByTabId, [tabId]: "" },
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              stack: [],
              rightChatCollapsed: shouldExitFull ? false : tab.rightChatCollapsed,
            }),
          ),
        }));
      },

      setStackHidden: (tabId, hidden) => {
        set((state) => ({
          stackHiddenByTabId: { ...state.stackHiddenByTabId, [tabId]: Boolean(hidden) },
        }));
      },

      setStackItemParams: (tabId, itemId, params) => {
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === tabId);
          if (index === -1) return state;
          const tab = state.tabs[index];
          const stack = tab?.stack ?? [];
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
          const nextTabs = [...state.tabs];
          nextTabs[index] = normalizeDock({ ...tab, stack: nextStack });
          return { tabs: nextTabs };
        });
      },

      upsertToolPart: (tabId, key, part) => {
        set((state) => {
          const current = state.toolPartsByTabId[tabId] ?? {};
          return {
            toolPartsByTabId: { ...state.toolPartsByTabId, [tabId]: { ...current, [key]: part } },
          };
        });
      },

      clearToolPartsForTab: (tabId) => {
        set((state) => {
          if (!state.toolPartsByTabId[tabId]) return state;
          const next = { ...state.toolPartsByTabId };
          delete next[tabId];
          return { toolPartsByTabId: next };
        });
      },
    }),
    {
      name: TABS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 5,
      migrate: (persisted: any) => {
        const now = Date.now();
        const tabs = Array.isArray(persisted?.tabs) ? persisted.tabs : [];

        /** Normalize a persisted dock item from storage. */
        const normalizeDockItem = (raw: any): DockItem | null => {
          if (!raw || typeof raw !== "object") return null;
          const id = typeof raw.id === "string" ? raw.id : "";
          const component = typeof raw.component === "string" ? raw.component : "";
          if (!id || !component) return null;
          const params =
            typeof raw.params === "object" && raw.params ? { ...raw.params } : undefined;
          const item: DockItem = {
            id,
            component,
            params,
            title: typeof raw.title === "string" ? raw.title : undefined,
            sourceKey: typeof raw.sourceKey === "string" ? raw.sourceKey : undefined,
            denyClose: typeof raw.denyClose === "boolean" ? raw.denyClose : undefined,
          };
          if (component === BROWSER_WINDOW_COMPONENT) {
            return normalizeBrowserWindowItem(undefined, item);
          }
          if (component === TERMINAL_WINDOW_COMPONENT) {
            return normalizeTerminalWindowItem(undefined, item);
          }
          return item;
        };

        return {
          ...persisted,
          tabs: tabs.map((tab: any) => {
            const stack = Array.isArray(tab?.stack) ? tab.stack : [];
            const normalizedStack = stack
              .map(normalizeDockItem)
              .filter(Boolean) as DockItem[];
            const normalizedBase = normalizeDockItem(tab?.base) ?? undefined;
            const hasLeftContent = Boolean(normalizedBase) || normalizedStack.length > 0;
            const legacyPx = Number(tab?.leftWidthPx);
            const leftWidthPercent = hasLeftContent
              ? (Number.isFinite(tab?.leftWidthPercent)
                  ? clampPercent(tab.leftWidthPercent)
                  : Number.isFinite(legacyPx)
                    ? LEFT_DOCK_DEFAULT_PERCENT
                    : LEFT_DOCK_DEFAULT_PERCENT)
              : 0;
            return normalizeDock({
              id: typeof tab?.id === "string" && tab.id ? tab.id : generateId("tab"),
              workspaceId:
                typeof tab?.workspaceId === "string" && tab.workspaceId
                  ? tab.workspaceId
                  : "unknown",
              title:
                typeof tab?.title === "string" && tab.title
                  ? tab.title
                  : DEFAULT_TAB_INFO.title,
              icon:
                typeof tab?.icon === "string" && tab.icon ? tab.icon : DEFAULT_TAB_INFO.icon,
              isPin: Boolean(tab?.isPin),
              chatSessionId:
                typeof tab?.chatSessionId === "string" && tab.chatSessionId
                  ? tab.chatSessionId
                  : createChatSessionId(),
              chatParams:
                typeof tab?.chatParams === "object" && tab.chatParams ? tab.chatParams : undefined,
              chatLoadHistory:
                typeof tab?.chatLoadHistory === "boolean" ? tab.chatLoadHistory : undefined,
              rightChatCollapsed:
                typeof tab?.rightChatCollapsed === "boolean" ? tab.rightChatCollapsed : false,
              base: normalizedBase,
              stack: normalizedStack,
              leftWidthPercent,
              minLeftWidth:
                Number.isFinite(tab?.minLeftWidth) ? tab.minLeftWidth : undefined,
              createdAt: Number.isFinite(tab?.createdAt) ? tab.createdAt : now,
              lastActiveAt: Number.isFinite(tab?.lastActiveAt) ? tab.lastActiveAt : now,
            } as Tab);
          }),
          // v3 新增 stackHiddenByTabId，默认不隐藏。
          stackHiddenByTabId: persisted?.stackHiddenByTabId ?? {},
          // v4 新增 activeStackItemIdByTabId，默认不指定（用 stack 最后一个兜底）。
          activeStackItemIdByTabId: persisted?.activeStackItemIdByTabId ?? {},
        };
      },
      // 只落盘 tabs 与 activeTabId；toolPartsByTabId 属于运行时大对象，不持久化。
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        stackHiddenByTabId: state.stackHiddenByTabId,
        activeStackItemIdByTabId: state.activeStackItemIdByTabId,
      }),
    },
  ),
);
