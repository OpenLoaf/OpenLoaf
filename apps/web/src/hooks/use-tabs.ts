"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_TAB_INFO, type DockItem, type Tab } from "@teatime-ai/api/common";

export const TABS_STORAGE_KEY = "teatime:tabs";

export const LEFT_DOCK_MIN_PX = 360;
export const LEFT_DOCK_DEFAULT_PERCENT = 30;

function clampPercent(value: number) {
  // 约束百分比到 [0, 100]，并且对 NaN/Infinity 做兜底。
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export type ToolPartSnapshot = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

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

  /** 运行时缓存：工具调用片段（不落盘，避免 localStorage 过大/频繁写入）。 */
  toolPartsByTabId: Record<string, Record<string, ToolPartSnapshot>>;

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

  setTabBase: (tabId: string, base: DockItem | undefined) => void;
  setTabLeftWidthPercent: (tabId: string, percent: number) => void;
  setTabMinLeftWidth: (tabId: string, minWidth?: number) => void;
  setTabRightChatCollapsed: (tabId: string, collapsed: boolean) => void;
  setTabChatSession: (
    tabId: string,
    chatSessionId: string,
    options?: { loadHistory?: boolean },
  ) => void;

  pushStackItem: (tabId: string, item: DockItem, percent?: number) => void;
  removeStackItem: (tabId: string, itemId: string) => void;
  clearStack: (tabId: string) => void;

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

function normalizeDock(tab: Tab): Tab {
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

function updateTabById(tabs: Tab[], tabId: string, updater: (tab: Tab) => Tab) {
  // immutable 更新指定 tab，保持数组引用变化以触发订阅更新。
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return tabs;
  const nextTabs = [...tabs];
  nextTabs[index] = updater(nextTabs[index]!);
  return nextTabs;
}

export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      toolPartsByTabId: {},

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
          const createdChatSessionId = requestedChatSessionId ?? generateId("chat");
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

          return { tabs: [...state.tabs, nextTab], activeTabId: nextTab.id };
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
              // 切换 chatSession 时清空左侧 stack（避免旧的工具/页面残留在左侧栈里）。
              stack: [],
            }),
          ),
        }));
      },

      pushStackItem: (tabId, item, percent) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => {
            // 左侧 stack：同 sourceKey/id 视为同一条目（upsert），用于“同一个来源的面板重复打开”。
            const nextTab = normalizeDock(tab);
            const key = item.sourceKey ?? item.id;
            const existingIndex = nextTab.stack.findIndex((s) => (s.sourceKey ?? s.id) === key);

            const nextStack =
              existingIndex === -1
                ? [...nextTab.stack, item]
                : [
                    ...nextTab.stack.slice(0, existingIndex),
                    ...nextTab.stack.slice(existingIndex + 1),
                    { ...nextTab.stack[existingIndex]!, ...item },
                  ];

            return normalizeDock({
              ...nextTab,
              stack: nextStack,
              // 打开 stack 时自动撑开左栏：如果传了 percent 用它，否则保持原值/回退默认值。
              leftWidthPercent: clampPercent(
                Number.isFinite(percent)
                  ? percent!
                  : nextTab.leftWidthPercent > 0
                    ? nextTab.leftWidthPercent
                    : LEFT_DOCK_DEFAULT_PERCENT,
              ),
            });
          }),
        }));
      },

      removeStackItem: (tabId, itemId) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              stack: (tab.stack ?? []).filter((item) => item.id !== itemId),
            }),
          ),
        }));
      },

      clearStack: (tabId) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              stack: [],
            }),
          ),
        }));
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
      version: 2,
      migrate: (persisted: any) => {
        // 存储迁移（v2）：清理历史字段（leftWidthPx -> leftWidthPercent）。
        const tabs = Array.isArray(persisted?.tabs) ? persisted.tabs : [];
        return {
          ...persisted,
          tabs: tabs.map((tab: any) => {
            const stack = Array.isArray(tab?.stack) ? tab.stack : [];
            const hasLeftContent = Boolean(tab?.base) || stack.length > 0;
            const legacyPx = Number(tab?.leftWidthPx);
            const leftWidthPercent = hasLeftContent
              ? (Number.isFinite(tab?.leftWidthPercent)
                  ? clampPercent(tab.leftWidthPercent)
                  : Number.isFinite(legacyPx)
                    ? LEFT_DOCK_DEFAULT_PERCENT
                    : LEFT_DOCK_DEFAULT_PERCENT)
              : 0;
            return normalizeDock({ ...tab, stack, leftWidthPercent } as Tab);
          }),
        };
      },
      // 只落盘 tabs 与 activeTabId；toolPartsByTabId 属于运行时大对象，不持久化。
      partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId }),
    },
  ),
);
