import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// 定义面板配置接口
interface PanelConfig {
  component: string;
  params: Record<string, any>;
  hidden?: boolean;
}

// 定义标签页类型
interface Tab {
  id: string;
  title: string;
  leftPanel?: PanelConfig;
  rightPanel?: PanelConfig;
  workspaceId: string;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (tab: Omit<Tab, "id"> & { id?: string; createNew?: boolean }) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateCurrentTabPanels: (
    panels: Partial<{
      leftPanel: Partial<PanelConfig>;
      rightPanel: Partial<PanelConfig>;
    }>
  ) => void;
  updateTabPanels: (
    tabId: string,
    panels: Partial<{
      leftPanel: Partial<PanelConfig>;
      rightPanel: Partial<PanelConfig>;
    }>
  ) => void;
  getTabById: (tabId: string) => Tab | undefined;
  getShowPanelRightButton: () => boolean;
  getWorkspaceTabs: (workspaceId: string) => Tab[];
}

const STORAGE_KEY = "tabs-storage";

export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      addTab: (tab) => {
        set((state) => {
          const { id, createNew = false, ...tabData } = tab;
          const tabId = id || `tab-${Date.now()}`;

          // 确保leftPanel和rightPanel已经被正确初始化
          const safeTabData = {
            ...tabData,
            leftPanel: tabData.leftPanel || {
              component: "plant-page",
              params: {},
              hidden: false,
            },
            rightPanel: tabData.rightPanel || {
              component: "ai-chat",
              params: {},
              hidden: false,
            },
          };

          // 检查标签页是否已存在
          const existingTabIndex = state.tabs.findIndex((t) => t.id === tabId);

          // 如果存在，更新该标签页并设为活跃
          if (existingTabIndex !== -1) {
            const newTabs = [...state.tabs];
            newTabs[existingTabIndex] = { id: tabId, ...safeTabData };
            return {
              tabs: newTabs,
              activeTabId: tabId,
            };
          }

          // 如果createNew为false且有活跃标签页，替换当前活跃标签页
          if (!createNew && state.activeTabId) {
            const activeTabIndex = state.tabs.findIndex(
              (t) => t.id === state.activeTabId
            );
            if (activeTabIndex !== -1) {
              const newTabs = [...state.tabs];
              newTabs[activeTabIndex] = { id: tabId, ...safeTabData };
              return {
                tabs: newTabs,
                activeTabId: tabId,
              };
            }
          }

          // 否则创建新标签页
          return {
            tabs: [...state.tabs, { id: tabId, ...safeTabData }],
            activeTabId: tabId,
          };
        });
      },

      closeTab: (tabId) => {
        set((state) => {
          const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
          let newActiveTabId = state.activeTabId;

          // 如果关闭的是当前活跃标签页，选择新的活跃标签页
          if (newActiveTabId === tabId) {
            newActiveTabId =
              newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
          }

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
          };
        });
      },

      setActiveTab: (tabId) => {
        set({ activeTabId: tabId });
      },

      updateCurrentTabPanels: (panels) => {
        set((state) => {
          if (!state.activeTabId) return state;

          const newTabs = state.tabs.map((tab) => {
            if (tab.id === state.activeTabId) {
              // 确保tab的左右面板已经被正确初始化
              const safeTab = {
                ...tab,
                leftPanel: tab.leftPanel || {
                  component: "plant-page",
                  params: {},
                  hidden: false,
                },
                rightPanel: tab.rightPanel || {
                  component: "ai-chat",
                  params: {},
                  hidden: false,
                },
              };

              return {
                ...safeTab,
                leftPanel: panels.leftPanel
                  ? { ...safeTab.leftPanel, ...panels.leftPanel }
                  : safeTab.leftPanel,
                rightPanel: panels.rightPanel
                  ? { ...safeTab.rightPanel, ...panels.rightPanel }
                  : safeTab.rightPanel,
              };
            }
            return tab;
          });

          return {
            tabs: newTabs,
          };
        });
      },

      updateTabPanels: (tabId, panels) => {
        set((state) => {
          const newTabs = state.tabs.map((tab) => {
            if (tab.id === tabId) {
              // 确保tab的左右面板已经被正确初始化
              const safeTab = {
                ...tab,
                leftPanel: tab.leftPanel || {
                  component: "plant-page",
                  params: {},
                  hidden: false,
                },
                rightPanel: tab.rightPanel || {
                  component: "ai-chat",
                  params: {},
                  hidden: false,
                },
              };

              return {
                ...safeTab,
                leftPanel: panels.leftPanel
                  ? { ...safeTab.leftPanel, ...panels.leftPanel }
                  : safeTab.leftPanel,
                rightPanel: panels.rightPanel
                  ? { ...safeTab.rightPanel, ...panels.rightPanel }
                  : safeTab.rightPanel,
              };
            }
            return tab;
          });

          return {
            tabs: newTabs,
          };
        });
      },

      getTabById: (tabId) => {
        return get().tabs.find((tab) => tab.id === tabId);
      },

      getShowPanelRightButton: () => {
        const state = get();
        const activeTab = state.tabs.find(
          (tab) => tab.id === state.activeTabId
        );

        // 如果没有激活的tab，返回false
        if (!activeTab) return false;

        const { leftPanel, rightPanel } = activeTab;

        // 1. 检查rightPanel是否存在且有内容
        const hasRightContent = Boolean(
          rightPanel &&
            rightPanel.component &&
            rightPanel.component.trim() !== ""
        );

        // 2. 检查leftPanel是否不存在或为hidden
        const isLeftPanelHiddenOrMissing = !leftPanel || leftPanel.hidden;

        // 3. 除非leftPanel为hidden或不存在，否则只要有rightPanel就显示按钮
        return Boolean(hasRightContent && !isLeftPanelHiddenOrMissing);
      },

      // 获取当前工作区的标签列表
      getWorkspaceTabs: (workspaceId) => {
        return get().tabs.filter((tab) => tab.workspaceId === workspaceId);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
