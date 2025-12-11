import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// 定义面板配置接口
interface PanelConfig {
  component: string;
  params: Record<string, any>;
  hidden?: boolean;
}

type PanelUpdates = Partial<{
  leftPanel: Partial<PanelConfig>;
  rightPanel: Partial<PanelConfig>;
}>;

// 定义标签页类型
export interface Tab {
  id: string;
  title: string;
  leftPanel?: PanelConfig;
  rightPanel?: PanelConfig;
  leftWidth?: number;
  workspaceId: string;
  isPin?: boolean;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  activeLeftPanel?: PanelConfig;
  activeRightPanel?: PanelConfig;
  activeLeftWidth: number;
  addTab: (tab: Omit<Tab, "id"> & { id?: string; createNew?: boolean }) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateCurrentTabPanels: (panels: PanelUpdates) => void;
  updateTabPanels: (tabId: string, panels: PanelUpdates) => void;
  updateCurrentTabLeftWidth: (width: number) => void;
  getTabById: (tabId: string) => Tab | undefined;
  getWorkspaceTabs: (workspaceId: string) => Tab[];
  reorderTabs: (
    workspaceId: string,
    sourceTabId: string,
    targetTabId: string,
    position?: "before" | "after"
  ) => void;
  setTabPinned: (tabId: string, isPin: boolean) => void;
}

const STORAGE_KEY = "tabs-storage";

const createDefaultRightPanel = (): PanelConfig => ({
  component: "ai-chat",
  params: {},
  hidden: false,
});

const withPanelDefaults = <
  T extends { leftPanel?: PanelConfig; rightPanel?: PanelConfig }
>(
  tab: T
) => ({
  ...tab,
  rightPanel: tab.rightPanel || createDefaultRightPanel(),
});

const mergePanels = (tab: Tab, panels: PanelUpdates): Tab => {
  const normalizedTab = withPanelDefaults(tab);

  const mergedLeftPanel = panels.leftPanel
    ? normalizedTab.leftPanel
      ? { ...normalizedTab.leftPanel, ...panels.leftPanel }
      : (panels.leftPanel as PanelConfig)
    : normalizedTab.leftPanel;

  return {
    ...normalizedTab,
    leftPanel: mergedLeftPanel,
    rightPanel: panels.rightPanel
      ? { ...normalizedTab.rightPanel, ...panels.rightPanel }
      : normalizedTab.rightPanel,
  };
};

const applyPanelUpdatesForTab = (
  state: TabsState,
  targetTabId: string,
  panels: PanelUpdates
) => {
  let updatedLeftPanel: PanelConfig | undefined;
  let updatedRightPanel: PanelConfig | undefined;

  const tabs = state.tabs.map((tab) => {
    if (tab.id !== targetTabId) return tab;

    const updatedTab = mergePanels(tab, panels);

    if (targetTabId === state.activeTabId) {
      updatedLeftPanel = updatedTab.leftPanel;
      updatedRightPanel = updatedTab.rightPanel;
    }

    return updatedTab;
  });

  return { tabs, updatedLeftPanel, updatedRightPanel };
};

const orderWorkspaceTabs = (tabs: Tab[]) => {
  const pinned: Tab[] = [];
  const regular: Tab[] = [];

  tabs.forEach((tab) => {
    if (tab.isPin) {
      pinned.push(tab);
    } else {
      regular.push(tab);
    }
  });

  return [...pinned, ...regular];
};

export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      activeLeftPanel: undefined,
      activeRightPanel: undefined,
      activeLeftWidth: 50,

      addTab: (tab) => {
        set((state) => {
          const { id, createNew = false, ...tabData } = tab;
          const tabId = id || `tab-${Date.now()}`;

          const normalizedTab = withPanelDefaults({
            ...tabData,
            id: tabId,
            leftWidth: tabData.leftWidth || 50,
            isPin: tabData.isPin ?? false,
          });

          // 检查标签页是否已存在
          const existingTabIndex = state.tabs.findIndex((t) => t.id === tabId);

          // 如果存在，更新该标签页并设为活跃
          if (existingTabIndex !== -1) {
            const newTabs = [...state.tabs];
            newTabs[existingTabIndex] = normalizedTab;
            return {
              tabs: newTabs,
              activeTabId: tabId,
              activeLeftPanel: normalizedTab.leftPanel,
              activeRightPanel: normalizedTab.rightPanel,
            };
          }

          // 如果createNew为false且有活跃标签页，替换当前活跃标签页
          if (!createNew && state.activeTabId) {
            const activeTabIndex = state.tabs.findIndex(
              (t) => t.id === state.activeTabId
            );
            if (activeTabIndex !== -1) {
              const newTabs = [...state.tabs];
              newTabs[activeTabIndex] = normalizedTab;
              return {
                tabs: newTabs,
                activeTabId: tabId,
                activeLeftPanel: normalizedTab.leftPanel,
                activeRightPanel: normalizedTab.rightPanel,
              };
            }
          }

          // 否则创建新标签页
          return {
            tabs: [...state.tabs, normalizedTab],
            activeTabId: tabId,
            activeLeftPanel: normalizedTab.leftPanel,
            activeRightPanel: normalizedTab.rightPanel,
          };
        });
      },

      closeTab: (tabId) => {
        set((state) => {
          // 获取要关闭的标签页的工作区ID
          const tabToClose = state.tabs.find((tab) => tab.id === tabId);
          if (!tabToClose || tabToClose.isPin) return state;

          // 获取该工作区的所有标签页
          const workspaceTabs = state.tabs.filter(
            (tab) => tab.workspaceId === tabToClose.workspaceId
          );

          // 如果该工作区只有一个标签页，不允许关闭
          if (workspaceTabs.length <= 1) return state;

          const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
          let newActiveTabId = state.activeTabId;

          // 如果关闭的是当前活跃标签页，选择新的活跃标签页
          if (newActiveTabId === tabId) {
            newActiveTabId =
              newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
          }

          // 获取新的活跃标签页
          const newActiveTab = newTabs.find((tab) => tab.id === newActiveTabId);

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
            activeLeftPanel: newActiveTab?.leftPanel,
            activeRightPanel: newActiveTab?.rightPanel,
          };
        });
      },

      setActiveTab: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        set({
          activeTabId: tabId,
          activeLeftPanel: tab?.leftPanel,
          activeRightPanel: tab?.rightPanel || createDefaultRightPanel(),
          activeLeftWidth: tab?.leftWidth || 50,
        });
      },

      updateCurrentTabPanels: (panels) => {
        set((state) => {
          if (!state.activeTabId) return state;

          const { tabs, updatedLeftPanel, updatedRightPanel } =
            applyPanelUpdatesForTab(state, state.activeTabId, panels);

          return {
            tabs,
            activeLeftPanel: updatedLeftPanel,
            activeRightPanel: updatedRightPanel,
          };
        });
      },

      updateTabPanels: (tabId, panels) => {
        set((state) => {
          const { tabs, updatedLeftPanel, updatedRightPanel } =
            applyPanelUpdatesForTab(state, tabId, panels);

          const result: Partial<TabsState> = { tabs };

          if (updatedLeftPanel) {
            result.activeLeftPanel = updatedLeftPanel;
          }
          if (updatedRightPanel) {
            result.activeRightPanel = updatedRightPanel;
          }

          return result;
        });
      },

      updateCurrentTabLeftWidth: (width) => {
        set((state) => {
          if (!state.activeTabId) return state;

          const newTabs = state.tabs.map((tab) => {
            if (tab.id === state.activeTabId) {
              return {
                ...tab,
                leftWidth: width,
              };
            }
            return tab;
          });

          return {
            tabs: newTabs,
            activeLeftWidth: width,
          };
        });
      },

      getTabById: (tabId) => {
        return get().tabs.find((tab) => tab.id === tabId);
      },

      // 获取当前工作区的标签列表
      getWorkspaceTabs: (workspaceId) => {
        const workspaceTabs = orderWorkspaceTabs(
          get().tabs.filter((tab) => tab.workspaceId === workspaceId)
        );

        // 如果没有标签页，返回一个默认标签页
        if (workspaceTabs.length === 0) {
          const defaultTab: Tab = {
            id: `default-tab-${workspaceId}`,
            title: "New Page",
            workspaceId,
            rightPanel: createDefaultRightPanel(),
            isPin: false,
          };
          return [defaultTab];
        }

        return workspaceTabs;
      },

      reorderTabs: (workspaceId, sourceTabId, targetTabId, position = "before") => {
        set((state) => {
          if (sourceTabId === targetTabId) return state;

          const workspaceTabs = orderWorkspaceTabs(
            state.tabs.filter((tab) => tab.workspaceId === workspaceId)
          );
          const pinnedCount = workspaceTabs.filter((tab) => tab.isPin).length;

          const fromIndex = workspaceTabs.findIndex(
            (tab) => tab.id === sourceTabId
          );
          const toIndex = workspaceTabs.findIndex(
            (tab) => tab.id === targetTabId
          );

          if (fromIndex === -1 || toIndex === -1) return state;

          const sourcePinned = workspaceTabs[fromIndex]?.isPin;
          const targetPinned = workspaceTabs[toIndex]?.isPin;

          const reordered = [...workspaceTabs];
          const [moved] = reordered.splice(fromIndex, 1);
          let targetIndex = toIndex;

          // adjust target index after removal
          if (fromIndex < toIndex) {
            targetIndex -= 1;
          }

          if (position === "after") {
            targetIndex += 1;
          }

          // keep pinned tabs before unpinned tabs
          if (sourcePinned && !targetPinned) {
            targetIndex = Math.min(targetIndex, Math.max(0, pinnedCount - 1));
          } else if (!sourcePinned && targetPinned) {
            targetIndex = Math.max(targetIndex, pinnedCount);
          }

          // enforce bounds
          const lowerBound = sourcePinned ? 0 : pinnedCount;
          const upperBound = sourcePinned ? Math.max(pinnedCount - 1, 0) : reordered.length;
          const boundedIndex = Math.max(
            lowerBound,
            Math.min(targetIndex, upperBound)
          );
          reordered.splice(boundedIndex, 0, moved);

          // rebuild tabs keeping other workspaces in place
          const workspaceQueue = [...reordered];
          const newTabs = state.tabs.map((tab) =>
            tab.workspaceId !== workspaceId ? tab : (workspaceQueue.shift() as Tab)
          );

          return { tabs: newTabs };
        });
      },

      setTabPinned: (tabId, isPin) => {
        set((state) => {
          const target = state.tabs.find((tab) => tab.id === tabId);
          if (!target) return state;

          const updatedTabs = state.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, isPin } : tab
          );

          const workspaceTabs = orderWorkspaceTabs(
            updatedTabs.filter((tab) => tab.workspaceId === target.workspaceId)
          );

          const workspaceQueue = [...workspaceTabs];
          const newTabs = updatedTabs.map((tab) =>
            tab.workspaceId !== target.workspaceId
              ? tab
              : (workspaceQueue.shift() as Tab)
          );

          return { tabs: newTabs };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
