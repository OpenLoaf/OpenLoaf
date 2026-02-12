"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_TAB_INFO, type DockItem } from "@tenas-ai/api/common";
import { createChatSessionId } from "@/lib/chat-session-id";
import { useChatRuntime } from "./use-chat-runtime";
import { useTabRuntime } from "./use-tab-runtime";
import type { TabMeta } from "./tab-types";
import { LEFT_DOCK_DEFAULT_PERCENT, LEFT_DOCK_MIN_PX } from "./tab-utils";

export const TABS_STORAGE_KEY = "tenas:tabs";
export { LEFT_DOCK_DEFAULT_PERCENT, LEFT_DOCK_MIN_PX };

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
  tabs: TabMeta[];
  activeTabId: string | null;
  addTab: (input: AddTabInput) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  getTabById: (tabId: string) => TabMeta | undefined;
  getWorkspaceTabs: (workspaceId: string) => TabMeta[];
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
  setTabSessionTitles: (tabId: string, titles: Record<string, string>) => void;
  addTabSession: (tabId: string, sessionId: string) => void;
  removeTabSession: (tabId: string, sessionId: string) => void;
  /** Move a tab session within its list. */
  moveTabSession: (tabId: string, sessionId: string, direction: "up" | "down") => void;
  setActiveTabSession: (
    tabId: string,
    sessionId: string,
    options?: { loadHistory?: boolean; replaceCurrent?: boolean },
  ) => void;
  setTabChatSession: (
    tabId: string,
    chatSessionId: string,
    options?: { loadHistory?: boolean; replaceCurrent?: boolean },
  ) => void;
}

function generateId(prefix = "id") {
  // 生成稳定的本地 ID：优先 randomUUID，降级到时间戳 + 随机数。
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function orderWorkspaceTabs(tabs: TabMeta[]) {
  // 固定标签始终排在前面；普通标签保持相对顺序。
  const pinned: TabMeta[] = [];
  const regular: TabMeta[] = [];

  for (const tab of tabs) {
    if (tab.isPin) pinned.push(tab);
    else regular.push(tab);
  }

  return [...pinned, ...regular];
}

function updateTabById(tabs: TabMeta[], tabId: string, updater: (tab: TabMeta) => TabMeta) {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return tabs;
  const nextTabs = [...tabs];
  nextTabs[index] = updater(nextTabs[index]!);
  return nextTabs;
}

function normalizeTabSessionState(tab: TabMeta) {
  const rawIds =
    Array.isArray(tab.chatSessionIds) && tab.chatSessionIds.length > 0
      ? tab.chatSessionIds
      : [tab.chatSessionId];
  const ids = rawIds.filter((id) => typeof id === "string" && id.length > 0);
  const fallbackIds = ids.length > 0 ? ids : [tab.chatSessionId];
  let activeIndex =
    typeof tab.activeSessionIndex === "number" ? tab.activeSessionIndex : -1;
  if (activeIndex < 0 || activeIndex >= fallbackIds.length) {
    activeIndex = Math.max(0, fallbackIds.indexOf(tab.chatSessionId));
  }
  if (activeIndex < 0 || activeIndex >= fallbackIds.length) {
    activeIndex = 0;
  }
  return {
    ids: fallbackIds,
    activeIndex,
    activeSessionId: fallbackIds[activeIndex] ?? tab.chatSessionId,
  };
}

export const useTabs = create<TabsState>()(
  persist(
    (set, get): TabsState => ({
      tabs: [],
      activeTabId: null,

      addTab: (input) => {
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

        const nextTab: TabMeta = {
          id: tabId,
          workspaceId,
          title: title ?? DEFAULT_TAB_INFO.title,
          icon: icon ?? DEFAULT_TAB_INFO.icon,
          isPin: isPin ?? false,
          chatSessionId: createdChatSessionId,
          chatSessionIds: [createdChatSessionId],
          activeSessionIndex: 0,
          chatParams,
          chatLoadHistory: createdChatLoadHistory,
          createdAt: now,
          lastActiveAt: now,
        };

        set((state) => ({
          tabs: [...state.tabs, nextTab],
          activeTabId: nextTab.id,
        }));

        // 中文注释：初始化 runtime，避免 UI 读取到空结构。
        useTabRuntime.getState().setRuntimeByTabId(tabId, {
          base: normalizedBase,
          stack: [],
          leftWidthPercent: normalizedBase ? leftWidthPercent ?? 0 : 0,
          rightChatCollapsed: rightChatCollapsed ?? true,
          stackHidden: false,
          activeStackItemId: "",
        });
      },

      closeTab: (tabId) => {
        let shouldClearRuntime = false;
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
          let nextActiveTabId = state.activeTabId;
          if (state.activeTabId === tabId) {
            const remaining = nextTabs.filter((tab) => tab.workspaceId === tabToClose.workspaceId);
            const fallback =
              remaining.reduce<TabMeta | null>(
                (best, tab) => (!best || tab.lastActiveAt > best.lastActiveAt ? tab : best),
                null,
              ) ?? null;
            nextActiveTabId = fallback?.id ?? null;
          }

          shouldClearRuntime = true;
          return {
            tabs: nextTabs,
            activeTabId: nextActiveTabId,
          };
        });
        if (shouldClearRuntime) {
          // 中文注释：关闭标签时清理运行时与聊天状态，避免残留。
          useTabRuntime.getState().clearRuntimeByTabId(tabId);
          useChatRuntime.getState().clearRuntimeByTabId(tabId);
        }
      },

      setActiveTab: (tabId) => {
        set((state) => {
          // 激活标签：更新 lastActiveAt，供 closeTab 做“最近使用”回退。
          const existing = state.tabs.find((tab) => tab.id === tabId);
          if (!existing) return state;
          const now = Date.now();
          const nextTabs = updateTabById(state.tabs, tabId, (tab) => ({
            ...tab,
            lastActiveAt: now,
          }));
          return { tabs: nextTabs, activeTabId: tabId };
        });
      },

      getTabById: (tabId) => {
        const meta = get().tabs.find((tab) => tab.id === tabId);
        return meta ?? undefined;
      },

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
            tab.workspaceId !== workspaceId ? tab : (workspaceQueue.shift() as TabMeta),
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
            tab.workspaceId !== target.workspaceId ? tab : (workspaceQueue.shift() as TabMeta),
          );

          return { tabs: nextTabs };
        });
      },

      setTabTitle: (tabId, title) => {
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === tabId);
          if (index === -1) return state;
          const current = state.tabs[index]!;
          if (current.title === title) return state;
          const nextTabs = [...state.tabs];
          nextTabs[index] = { ...current, title };
          return { tabs: nextTabs };
        });
      },
      setTabIcon: (tabId, icon) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => ({
            ...tab,
            icon: icon ?? DEFAULT_TAB_INFO.icon,
          })),
        }));
      },
      setTabSessionTitles: (tabId, titles) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => {
            const nextTitles = { ...(tab.chatSessionTitles ?? {}), ...titles };
            const prevTitles = tab.chatSessionTitles ?? {};
            const prevKeys = Object.keys(prevTitles);
            const nextKeys = Object.keys(nextTitles);
            if (prevKeys.length === nextKeys.length) {
              let same = true;
              for (const key of nextKeys) {
                if (prevTitles[key] !== nextTitles[key]) {
                  same = false;
                  break;
                }
              }
              if (same) return tab;
            }
            return {
              ...tab,
              chatSessionTitles: nextTitles,
            };
          }),
        }));
      },

      addTabSession: (tabId, sessionId) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => {
            const { ids } = normalizeTabSessionState(tab);
            const existingIndex = ids.indexOf(sessionId);
            if (existingIndex >= 0) {
              return {
                ...tab,
                chatSessionIds: ids,
                activeSessionIndex: existingIndex,
                chatSessionId: sessionId,
                chatLoadHistory: false,
              };
            }
            const nextIds = [...ids, sessionId];
            return {
              ...tab,
              chatSessionIds: nextIds,
              activeSessionIndex: nextIds.length - 1,
              chatSessionId: sessionId,
              chatLoadHistory: false,
            };
          }),
        }));
      },

      removeTabSession: (tabId, sessionId) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => {
            const { ids, activeIndex } = normalizeTabSessionState(tab);
            const targetIndex = ids.indexOf(sessionId);
            if (targetIndex === -1) return tab;
            const nextIds = ids.filter((id) => id !== sessionId);
            const nextTitles = { ...(tab.chatSessionTitles ?? {}) };
            if (nextTitles[sessionId]) delete nextTitles[sessionId];
            if (nextIds.length === 0) {
              const fallbackSessionId = createChatSessionId();
              return {
                ...tab,
                chatSessionIds: [fallbackSessionId],
                activeSessionIndex: 0,
                chatSessionId: fallbackSessionId,
                chatSessionTitles: nextTitles,
                chatLoadHistory: false,
              };
            }
            let nextActiveIndex = activeIndex;
            if (targetIndex < activeIndex) nextActiveIndex = activeIndex - 1;
            if (targetIndex === activeIndex) {
              nextActiveIndex = Math.min(targetIndex, nextIds.length - 1);
            }
            const nextActiveSessionId = nextIds[nextActiveIndex] ?? nextIds[0]!;
            return {
              ...tab,
              chatSessionIds: nextIds,
              activeSessionIndex: nextActiveIndex,
              chatSessionId: nextActiveSessionId,
              chatSessionTitles: nextTitles,
              chatLoadHistory: targetIndex === activeIndex ? true : tab.chatLoadHistory,
            };
          }),
        }));
      },
      moveTabSession: (tabId, sessionId, direction) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => {
            const { ids, activeIndex, activeSessionId } = normalizeTabSessionState(tab);
            const currentIndex = ids.indexOf(sessionId);
            if (currentIndex === -1) return tab;
            const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= ids.length) return tab;
            const nextIds = [...ids];
            // 中文注释：交换相邻会话位置，保持活跃会话不变。
            [nextIds[currentIndex], nextIds[nextIndex]] = [
              nextIds[nextIndex]!,
              nextIds[currentIndex]!,
            ];
            const resolvedActiveIndex = nextIds.indexOf(activeSessionId ?? "");
            const nextActiveIndex =
              resolvedActiveIndex >= 0 ? resolvedActiveIndex : Math.min(activeIndex, nextIds.length - 1);
            const nextActiveSessionId = nextIds[nextActiveIndex] ?? tab.chatSessionId;
            return {
              ...tab,
              chatSessionIds: nextIds,
              activeSessionIndex: nextActiveIndex,
              chatSessionId: nextActiveSessionId,
            };
          }),
        }));
      },

      setActiveTabSession: (tabId, sessionId, options) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => {
            const { ids, activeIndex } = normalizeTabSessionState(tab);
            const existingIndex = ids.indexOf(sessionId);
            let nextIds = ids;
            let nextActiveIndex = activeIndex;
            if (existingIndex >= 0) {
              nextActiveIndex = existingIndex;
            } else if (options?.replaceCurrent && ids.length > 0) {
              nextIds = [...ids];
              nextIds[activeIndex] = sessionId;
            } else {
              nextIds = [...ids, sessionId];
              nextActiveIndex = nextIds.length - 1;
            }
            return {
              ...tab,
              chatSessionIds: nextIds,
              activeSessionIndex: nextActiveIndex,
              chatSessionId: sessionId,
              chatLoadHistory: options?.loadHistory,
            };
          }),
        }));
      },

      setTabChatSession: (tabId, chatSessionId, options) => {
        get().setActiveTabSession(tabId, chatSessionId, options);
      },
    }),
    {
      name: TABS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 7,
      migrate: (persisted: any) => {
        const now = Date.now();
        const tabs = Array.isArray(persisted?.tabs) ? persisted.tabs : [];

        return {
          ...persisted,
          tabs: tabs.map((tab: any): TabMeta => ({
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
            chatSessionIds:
              Array.isArray(tab?.chatSessionIds) && tab.chatSessionIds.length > 0
                ? tab.chatSessionIds.filter((id: unknown) => typeof id === "string")
                : undefined,
            activeSessionIndex:
              typeof tab?.activeSessionIndex === "number" ? tab.activeSessionIndex : undefined,
            chatSessionTitles:
              typeof tab?.chatSessionTitles === "object" && tab.chatSessionTitles
                ? (tab.chatSessionTitles as Record<string, string>)
                : undefined,
            chatParams:
              typeof tab?.chatParams === "object" && tab.chatParams ? tab.chatParams : undefined,
            chatLoadHistory:
              typeof tab?.chatLoadHistory === "boolean" ? tab.chatLoadHistory : undefined,
            createdAt: Number.isFinite(tab?.createdAt) ? tab.createdAt : now,
            lastActiveAt: Number.isFinite(tab?.lastActiveAt) ? tab.lastActiveAt : now,
          })).map((tab: TabMeta) => {
            const { ids, activeIndex, activeSessionId } = normalizeTabSessionState(tab);
            return {
              ...tab,
              chatSessionIds: ids,
              activeSessionIndex: activeIndex,
              chatSessionId: activeSessionId,
            };
          }),
        };
      },
      // 只落盘 tabs 与 activeTabId。
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    },
  ),
);
