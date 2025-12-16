import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_TAB_INFO,
  type DockItem,
  type Tab,
} from "@teatime-ai/api/types/tabs";

export const TABS_STORAGE_KEY = "tabs-storage";

export const LEFT_DOCK_MIN_PX = 360;
export const LEFT_DOCK_DEFAULT_PX = 480;

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
  workspaceId: string;
  title?: string;
  icon?: string;
  isPin?: boolean;
  createNew?: boolean;
  base?: DockItem;
  leftWidthPx?: number;
  chatSessionId?: string;
  chatParams?: Record<string, unknown>;
  chatLoadHistory?: boolean;
};

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  /** Runtime-only tool parts cache (not persisted). */
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

  setTabBase: (tabId: string, base: DockItem | undefined) => void;
  setTabLeftWidthPx: (tabId: string, widthPx: number) => void;
  setTabRightChatCollapsed: (tabId: string, collapsed: boolean) => void;
  setTabChatSession: (
    tabId: string,
    chatSessionId: string,
    options?: { loadHistory?: boolean },
  ) => void;

  pushStackItem: (tabId: string, item: DockItem) => void;
  removeStackItem: (tabId: string, itemId: string) => void;
  clearStack: (tabId: string) => void;

  upsertToolPart: (tabId: string, key: string, part: ToolPartSnapshot) => void;
  clearToolPartsForTab: (tabId: string) => void;
}

function generateId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function orderWorkspaceTabs(tabs: Tab[]) {
  const pinned: Tab[] = [];
  const regular: Tab[] = [];

  for (const tab of tabs) {
    if (tab.isPin) {
      pinned.push(tab);
    } else {
      regular.push(tab);
    }
  }

  return [...pinned, ...regular];
}

function normalizeDock(tab: Tab): Tab {
  const stack = Array.isArray(tab.stack) ? tab.stack : [];
  const hasLeftContent = Boolean(tab.base) || stack.length > 0;
  const leftWidthPx = hasLeftContent
    ? Math.max(
        LEFT_DOCK_MIN_PX,
        Number.isFinite(tab.leftWidthPx) ? tab.leftWidthPx : LEFT_DOCK_DEFAULT_PX,
      )
    : 0;

  return {
    ...tab,
    stack,
    leftWidthPx,
    rightChatCollapsed: tab.base ? Boolean(tab.rightChatCollapsed) : false,
  };
}

function updateTabById(
  tabs: Tab[],
  tabId: string,
  updater: (tab: Tab) => Tab,
) {
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
          const now = Date.now();
          const {
            createNew = false,
            workspaceId,
            base,
            title,
            icon,
            isPin,
            leftWidthPx,
            chatSessionId: requestedChatSessionId,
            chatParams,
            chatLoadHistory,
          } = input;

          const tabId = generateId("tab");
          // 关键约定：tabId 与 chatSessionId 解耦（随机生成、互不推导）。
          // 这样同一个资源也可以在不同 tab 中拥有独立会话（未来扩展用）。
          const createdChatSessionId =
            requestedChatSessionId ?? generateId("chat");
          const createdChatLoadHistory =
            chatLoadHistory ?? Boolean(requestedChatSessionId);

          const nextTab = normalizeDock({
            id: tabId,
            workspaceId,
            title: title ?? DEFAULT_TAB_INFO.title,
            icon: icon ?? DEFAULT_TAB_INFO.icon,
            isPin: isPin ?? false,
            chatSessionId: createdChatSessionId,
            chatParams,
            chatLoadHistory: createdChatLoadHistory,
            rightChatCollapsed: false,
            base,
            stack: [],
            leftWidthPx: base
              ? Math.max(
                  LEFT_DOCK_MIN_PX,
                  Number.isFinite(leftWidthPx) ? leftWidthPx! : LEFT_DOCK_DEFAULT_PX,
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
          const tabToClose = state.tabs.find((tab) => tab.id === tabId);
          if (!tabToClose || tabToClose.isPin) return state;

          const workspaceTabs = state.tabs.filter(
            (tab) => tab.workspaceId === tabToClose.workspaceId,
          );
          if (workspaceTabs.length <= 1) return state;

          const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
          const nextToolPartsByTabId = { ...state.toolPartsByTabId };
          delete nextToolPartsByTabId[tabId];

          let nextActiveTabId = state.activeTabId;
          if (state.activeTabId === tabId) {
            const remaining = nextTabs.filter(
              (tab) => tab.workspaceId === tabToClose.workspaceId,
            );
            const fallback =
              remaining.reduce<Tab | null>(
                (best, tab) =>
                  !best || tab.lastActiveAt > best.lastActiveAt ? tab : best,
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

      getTabById: (tabId) => get().tabs.find((tab) => tab.id === tabId),

      getWorkspaceTabs: (workspaceId) =>
        orderWorkspaceTabs(get().tabs.filter((tab) => tab.workspaceId === workspaceId)),

      reorderTabs: (workspaceId, sourceTabId, targetTabId, position = "before") => {
        set((state) => {
          if (sourceTabId === targetTabId) return state;

          const workspaceTabs = orderWorkspaceTabs(
            state.tabs.filter((tab) => tab.workspaceId === workspaceId),
          );
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
            targetIndex = Math.min(targetIndex, Math.max(0, pinnedCount - 1));
          } else if (!sourcePinned && targetPinned) {
            targetIndex = Math.max(targetIndex, pinnedCount);
          }

          const lowerBound = sourcePinned ? 0 : pinnedCount;
          const upperBound = sourcePinned
            ? Math.max(pinnedCount - 1, 0)
            : reordered.length;
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

          const updatedTabs = state.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, isPin } : tab,
          );

          const workspaceTabs = orderWorkspaceTabs(
            updatedTabs.filter((tab) => tab.workspaceId === target.workspaceId),
          );
          const workspaceQueue = [...workspaceTabs];
          const nextTabs = updatedTabs.map((tab) =>
            tab.workspaceId !== target.workspaceId ? tab : (workspaceQueue.shift() as Tab),
          );

          return { tabs: nextTabs };
        });
      },

      setTabBase: (tabId, base) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              base,
              leftWidthPx: base ? tab.leftWidthPx || LEFT_DOCK_DEFAULT_PX : tab.leftWidthPx,
            }),
          ),
        }));
      },

      setTabLeftWidthPx: (tabId, widthPx) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) =>
            normalizeDock({
              ...tab,
              leftWidthPx: widthPx,
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
              // tab 内切换会话：清空 stack（工具/资源 overlay 属于旧会话上下文），保留 base（项目面板）。
              chatSessionId,
              chatLoadHistory: options?.loadHistory,
              stack: [],
            }),
          ),
        }));
      },

      pushStackItem: (tabId, item) => {
        set((state) => ({
          tabs: updateTabById(state.tabs, tabId, (tab) => {
            const nextTab = normalizeDock(tab);
            // 去重键：优先用 sourceKey（例如 toolCallId），否则回退到 item.id。
            // 同一个结果重复出现时更新并保持顺序稳定，避免 stack 无限增长。
            const key = item.sourceKey ?? item.id;
            const existingIndex = nextTab.stack.findIndex(
              (s) => (s.sourceKey ?? s.id) === key,
            );

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
              leftWidthPx:
                nextTab.leftWidthPx > 0 ? nextTab.leftWidthPx : LEFT_DOCK_DEFAULT_PX,
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
            toolPartsByTabId: {
              ...state.toolPartsByTabId,
              [tabId]: { ...current, [key]: part },
            },
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs.map(normalizeDock),
        activeTabId: state.activeTabId,
      }),
      migrate: (persisted, version) => {
        if (version === 2) return persisted as any;
        return { tabs: [], activeTabId: null };
      },
    },
  ),
);
