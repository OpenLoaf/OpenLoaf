import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// 定义面板对话框接口
export interface PanelDialog {
  id: string;
  component: string;
  params: Record<string, any>;
}

// 定义面板配置接口
export interface PanelConfig {
  component: string;
  params: Record<string, any>;
  panelKey: string;
  hidden?: boolean;
  dialogs?: PanelDialog[];
}

type PanelUpdates = Partial<{
  leftPanel: Partial<PanelConfig>;
  rightPanel: Partial<PanelConfig>;
}>;

// 定义标签页类型
export interface Tab {
  id: string;
  // Logical resource identity for de-duping/activation (e.g. page id)
  resourceId?: string;
  title: string;
  icon?: string;
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
  addTab: (
    tab: Omit<Tab, "id" | "resourceId"> & {
      id?: string;
      resourceId?: string;
      createNew?: boolean;
    }
  ) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateCurrentTabPanels: (panels: PanelUpdates) => void;
  updateTabPanels: (tabId: string, panels: PanelUpdates) => void;
  updatePanelParamsByKey: (panelKey: string, params: Record<string, any>) => void;
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
  
  // Dialog methods
  addPanelDialog: (side: "left" | "right", dialog: Omit<PanelDialog, "id">) => void;
  removePanelDialog: (side: "left" | "right", dialogId: string) => void;
}

const STORAGE_KEY = "tabs-storage";

const generatePanelKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const generateDialogId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dialog-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const ensurePanelKey = (panel: PanelConfig): PanelConfig => {
  if (panel.panelKey) return panel;
  return { ...panel, panelKey: generatePanelKey() };
};

const createDefaultRightPanel = (): PanelConfig => ({
  component: "ai-chat",
  params: {},
  panelKey: generatePanelKey(),
  hidden: false,
  dialogs: [],
});

const withPanelDefaults = <
  T extends { leftPanel?: PanelConfig; rightPanel?: PanelConfig }
>(
  tab: T
) => {
  const rightPanel = tab.rightPanel
    ? ensurePanelKey(tab.rightPanel)
    : createDefaultRightPanel();

  const leftPanel = tab.leftPanel ? ensurePanelKey(tab.leftPanel) : undefined;

  return {
    ...tab,
    leftPanel,
    rightPanel,
  };
};

const mergePanelConfig = (
  current: PanelConfig | undefined,
  update: Partial<PanelConfig> | undefined
): PanelConfig | undefined => {
  if (!update) return current;
  if (!current) {
    const created = update as PanelConfig;
    return ensurePanelKey({
      ...created,
      panelKey: created.panelKey || generatePanelKey(),
      dialogs: created.dialogs || [],
    });
  }

  const componentChanged =
    typeof update.component === "string" && update.component !== current.component;

  const nextPanelKey = update.panelKey
    ? update.panelKey
    : componentChanged
      ? generatePanelKey()
      : current.panelKey;

  return {
    ...current,
    ...update,
    panelKey: nextPanelKey,
    params: { ...(current.params ?? {}), ...(update.params ?? {}) },
    dialogs: update.dialogs ?? current.dialogs ?? [],
  };
};

const mergePanels = (tab: Tab, panels: PanelUpdates): Tab => {
  const normalizedTab = withPanelDefaults(tab);

  return {
    ...normalizedTab,
    leftPanel: mergePanelConfig(normalizedTab.leftPanel, panels.leftPanel),
    rightPanel: mergePanelConfig(normalizedTab.rightPanel, panels.rightPanel)!,
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

export const DEFAULT_TAB_INFO = {
  title: "Ai Chat",
  icon: "bot",
} as const;

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
          const {
            id,
            resourceId,
            createNew = false,
            ...tabData
          } = tab;

          // Requested logical identity (e.g. page id). Falls back to id.
          const requestedResourceId = resourceId ?? id;

          // If a tab for this resource already exists, just activate/update it.
          if (requestedResourceId) {
            const existingTabIndex = state.tabs.findIndex(
              (t) =>
                t.resourceId === requestedResourceId &&
                t.workspaceId === tabData.workspaceId
            );
            if (existingTabIndex !== -1) {
              const existing = state.tabs[existingTabIndex];
              const updatedTab = withPanelDefaults({
                ...existing,
                ...tabData,
                resourceId: requestedResourceId,
                leftWidth: tabData.leftWidth || existing.leftWidth || 50,
                isPin: tabData.isPin ?? existing.isPin ?? false,
              });
              const newTabs = [...state.tabs];
              newTabs[existingTabIndex] = updatedTab;
              return {
                tabs: newTabs,
                activeTabId: existing.id,
                activeLeftPanel: updatedTab.leftPanel,
                activeRightPanel: updatedTab.rightPanel,
                activeLeftWidth: updatedTab.leftWidth || 50,
              };
            }
          }

          // If createNew is false, replace current active tab content but keep its id
          // to avoid unmounting/selection flicker in the tab highlight.
          if (!createNew && state.activeTabId) {
            const activeTabIndex = state.tabs.findIndex(
              (t) => t.id === state.activeTabId
            );
            if (activeTabIndex !== -1) {
              const stableTabId = state.activeTabId;
              const normalizedTab = withPanelDefaults({
                ...tabData,
                id: stableTabId,
                resourceId: requestedResourceId ?? stableTabId,
                leftWidth: tabData.leftWidth || 50,
                isPin: tabData.isPin ?? false,
              });
              const newTabs = [...state.tabs];
              newTabs[activeTabIndex] = normalizedTab;
              return {
                tabs: newTabs,
                activeTabId: stableTabId,
                activeLeftPanel: normalizedTab.leftPanel,
                activeRightPanel: normalizedTab.rightPanel,
                activeLeftWidth: normalizedTab.leftWidth || 50,
              };
            }
          }

          // Otherwise, create a new tab slot.
          const tabId = id || `tab-${Date.now()}`;
          const normalizedTab = withPanelDefaults({
            ...tabData,
            id: tabId,
            resourceId: requestedResourceId ?? tabId,
            leftWidth: tabData.leftWidth || 50,
            isPin: tabData.isPin ?? false,
          });

          return {
            tabs: [...state.tabs, normalizedTab],
            activeTabId: tabId,
            activeLeftPanel: normalizedTab.leftPanel,
            activeRightPanel: normalizedTab.rightPanel,
            activeLeftWidth: normalizedTab.leftWidth || 50,
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
          const rawNewActiveTab = newActiveTabId
            ? newTabs.find((tab) => tab.id === newActiveTabId)
            : undefined;
          const newActiveTab = rawNewActiveTab
            ? withPanelDefaults(rawNewActiveTab)
            : undefined;

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
        const normalizedTab = tab ? withPanelDefaults(tab) : undefined;
        set({
          activeTabId: tabId,
          activeLeftPanel: normalizedTab?.leftPanel,
          activeRightPanel: normalizedTab?.rightPanel,
          activeLeftWidth: normalizedTab?.leftWidth || 50,
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

      updatePanelParamsByKey: (panelKey, params) => {
        set((state) => {
          let activeLeftPanel = state.activeLeftPanel;
          let activeRightPanel = state.activeRightPanel;

          const tabs = state.tabs.map((tab) => {
            const nextTab = withPanelDefaults(tab);
            let didUpdate = false;

            const updatePanel = (panel: PanelConfig | undefined) => {
              if (!panel || panel.panelKey !== panelKey) return panel;
              didUpdate = true;
              return {
                ...panel,
                params: { ...(panel.params ?? {}), ...(params ?? {}) },
              };
            };

            const leftPanel = updatePanel(nextTab.leftPanel);
            const rightPanel = updatePanel(nextTab.rightPanel);

            if (!didUpdate) return nextTab;

            const updated = { ...nextTab, leftPanel, rightPanel };
            if (tab.id === state.activeTabId) {
              activeLeftPanel = leftPanel;
              activeRightPanel = rightPanel;
            }
            return updated;
          });

          return { tabs, activeLeftPanel, activeRightPanel };
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
            ...DEFAULT_TAB_INFO,
            workspaceId,
            rightPanel: createDefaultRightPanel(),
            isPin: false,
          };
          return [defaultTab];
        }

        return workspaceTabs;
      },

      reorderTabs: (
        workspaceId,
        sourceTabId,
        targetTabId,
        position = "before"
      ) => {
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
          const upperBound = sourcePinned
            ? Math.max(pinnedCount - 1, 0)
            : reordered.length;
          const boundedIndex = Math.max(
            lowerBound,
            Math.min(targetIndex, upperBound)
          );
          reordered.splice(boundedIndex, 0, moved);

          // rebuild tabs keeping other workspaces in place
          const workspaceQueue = [...reordered];
          const newTabs = state.tabs.map((tab) =>
            tab.workspaceId !== workspaceId
              ? tab
              : (workspaceQueue.shift() as Tab)
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
      
      addPanelDialog: (side, dialogInput) => {
        set((state) => {
          if (!state.activeTabId) return state;

          const newDialog: PanelDialog = {
            ...dialogInput,
            id: generateDialogId(),
          };

          const tabs = state.tabs.map((tab) => {
            if (tab.id !== state.activeTabId) return tab;
            
            const normalizedTab = withPanelDefaults(tab);
            
            if (side === "left") {
              const currentDialogs = normalizedTab.leftPanel?.dialogs || [];
              return {
                ...normalizedTab,
                leftPanel: {
                  ...normalizedTab.leftPanel!,
                  dialogs: [...currentDialogs, newDialog],
                },
              };
            } else {
              const currentDialogs = normalizedTab.rightPanel?.dialogs || [];
              return {
                ...normalizedTab,
                rightPanel: {
                  ...normalizedTab.rightPanel!,
                  dialogs: [...currentDialogs, newDialog],
                },
              };
            }
          });

          // Update active panels
          const activeTab = tabs.find(t => t.id === state.activeTabId);
          return {
             tabs,
             activeLeftPanel: activeTab?.leftPanel,
             activeRightPanel: activeTab?.rightPanel,
          };
        });
      },

      removePanelDialog: (side, dialogId) => {
        set((state) => {
          if (!state.activeTabId) return state;

          const tabs = state.tabs.map((tab) => {
            if (tab.id !== state.activeTabId) return tab;
            
            const normalizedTab = withPanelDefaults(tab);
            
            if (side === "left" && normalizedTab.leftPanel) {
              return {
                ...normalizedTab,
                leftPanel: {
                  ...normalizedTab.leftPanel,
                  dialogs: (normalizedTab.leftPanel.dialogs || []).filter(d => d.id !== dialogId),
                },
              };
            } else if (side === "right" && normalizedTab.rightPanel) {
               return {
                ...normalizedTab,
                rightPanel: {
                  ...normalizedTab.rightPanel,
                  dialogs: (normalizedTab.rightPanel.dialogs || []).filter(d => d.id !== dialogId),
                },
              };
            }
            return normalizedTab;
          });

          // Update active panels
          const activeTab = tabs.find(t => t.id === state.activeTabId);
          return {
             tabs,
             activeLeftPanel: activeTab?.leftPanel,
             activeRightPanel: activeTab?.rightPanel,
          };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
