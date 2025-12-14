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
  updatePanelParamsByKey: (
    panelKey: string,
    params: Record<string, any>
  ) => void;
  updateCurrentTabLeftWidth: (width: number) => void;
  getTabById: (tabId: string) => Tab | undefined;
  getWorkspaceTabs: (workspaceId: string) => Tab[];
  reorderTabs: (
    workspaceId: string,
    sourceTabId: string,
    targetTabId: string,
    position?: "before" | "after"
  ) => void; // 重新排序标签页
  setTabPinned: (tabId: string, isPin: boolean) => void;

  // Dialog methods
  addPanelDialog: (
    side: "left" | "right",
    dialog: Omit<PanelDialog, "id">
  ) => void;
  removePanelDialog: (side: "left" | "right", dialogId: string) => void;
}

const STORAGE_KEY = "tabs-storage"; // 存储键名，用于本地持久化

// 生成面板唯一标识
const generatePanelKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// 生成对话框唯一标识
const generateDialogId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dialog-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// 确保面板配置中包含唯一标识
const ensurePanelKey = (panel: PanelConfig): PanelConfig => {
  if (panel.panelKey) return panel;
  return { ...panel, panelKey: generatePanelKey() };
};

// 创建默认右侧面板配置
const createDefaultRightPanel = (): PanelConfig => ({
  component: "ai-chat",
  params: {},
  panelKey: generatePanelKey(),
  hidden: false,
  dialogs: [],
});

// 为标签页添加默认面板配置
const withPanelDefaults = <
  T extends { leftPanel?: PanelConfig; rightPanel?: PanelConfig },
>(
  tab: T
) => {
  // 确保右侧面板存在，不存在则创建默认面板
  const rightPanel = tab.rightPanel
    ? ensurePanelKey(tab.rightPanel)
    : createDefaultRightPanel();

  // 左侧面板可选，存在则确保有panelKey
  const leftPanel = tab.leftPanel ? ensurePanelKey(tab.leftPanel) : undefined;

  return {
    ...tab,
    leftPanel,
    rightPanel,
  };
};

// 合并面板配置 - 将更新内容合并到现有面板配置
const mergePanelConfig = (
  current: PanelConfig | undefined,
  update: Partial<PanelConfig> | undefined
): PanelConfig | undefined => {
  if (!update) return current; // 没有更新则返回当前配置
  if (!current) {
    // 不存在当前配置则创建新配置
    const created = update as PanelConfig;
    return ensurePanelKey({
      ...created,
      panelKey: created.panelKey || generatePanelKey(),
      dialogs: created.dialogs || [],
    });
  }

  // 检查组件是否变化
  const componentChanged =
    typeof update.component === "string" &&
    update.component !== current.component;

  // 确定新的panelKey：如果提供了新的panelKey则使用，否则如果组件变化则生成新key，否则使用当前key
  const nextPanelKey = update.panelKey
    ? update.panelKey
    : componentChanged
      ? generatePanelKey()
      : current.panelKey;

  return {
    ...current,
    ...update,
    panelKey: nextPanelKey,
    params: { ...(current.params ?? {}), ...(update.params ?? {}) }, // 合并参数
    dialogs: update.dialogs ?? current.dialogs ?? [], // 优先使用更新的对话框列表
  };
};

// 合并标签页的面板配置
const mergePanels = (tab: Tab, panels: PanelUpdates): Tab => {
  const normalizedTab = withPanelDefaults(tab);

  return {
    ...normalizedTab,
    leftPanel: mergePanelConfig(normalizedTab.leftPanel, panels.leftPanel),
    rightPanel: mergePanelConfig(normalizedTab.rightPanel, panels.rightPanel)!,
  };
};

// 为指定标签页应用面板更新
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

    // 如果更新的是当前激活标签页，同时更新活跃面板状态
    if (targetTabId === state.activeTabId) {
      updatedLeftPanel = updatedTab.leftPanel;
      updatedRightPanel = updatedTab.rightPanel;
    }

    return updatedTab;
  });

  return { tabs, updatedLeftPanel, updatedRightPanel };
};

// 对工作区标签页进行排序 - 固定标签页在前，普通标签页在后
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

// 默认标签页信息 - 当没有标签页时使用
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
          const { id, resourceId, createNew = false, ...tabData } = tab;

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

      // 关闭标签页方法
      closeTab: (tabId) => {
        set((state) => {
          // 获取要关闭的标签页的工作区ID
          const tabToClose = state.tabs.find((tab) => tab.id === tabId);
          if (!tabToClose || tabToClose.isPin) return state; // 固定标签页不允许关闭

          // 获取该工作区的所有标签页
          const workspaceTabs = state.tabs.filter(
            (tab) => tab.workspaceId === tabToClose.workspaceId
          );

          // 如果该工作区只有一个标签页，不允许关闭
          if (workspaceTabs.length <= 1) return state;

          const newTabs = state.tabs.filter((tab) => tab.id !== tabId);
          let newActiveTabId = state.activeTabId;

          // 如果关闭的是当前活跃标签页，选择新的活跃标签页（默认选择最后一个）
          if (newActiveTabId === tabId) {
            newActiveTabId =
              newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
          }

          // 获取新的活跃标签页并确保面板配置完整
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

      // 设置激活标签页方法
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

      // 更新当前激活标签页的面板方法
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

      // 更新指定标签页的面板方法
      updateTabPanels: (tabId, panels) => {
        set((state) => {
          const { tabs, updatedLeftPanel, updatedRightPanel } =
            applyPanelUpdatesForTab(state, tabId, panels);

          const result: Partial<TabsState> = { tabs };

          // 如果更新的是当前激活标签页，同时更新活跃面板状态
          if (updatedLeftPanel) {
            result.activeLeftPanel = updatedLeftPanel;
          }
          if (updatedRightPanel) {
            result.activeRightPanel = updatedRightPanel;
          }

          return result;
        });
      },

      // 根据面板key更新面板参数方法
      updatePanelParamsByKey: (panelKey, params) => {
        set((state) => {
          let activeLeftPanel = state.activeLeftPanel;
          let activeRightPanel = state.activeRightPanel;

          const tabs = state.tabs.map((tab) => {
            const nextTab = withPanelDefaults(tab);
            let didUpdate = false;

            // 更新匹配的面板参数
            const updatePanel = (panel: PanelConfig | undefined) => {
              if (!panel || panel.panelKey !== panelKey) return panel;
              didUpdate = true;
              return {
                ...panel,
                params: { ...(panel.params ?? {}), ...(params ?? {}) }, // 合并参数
              };
            };

            const leftPanel = updatePanel(nextTab.leftPanel);
            const rightPanel = updatePanel(nextTab.rightPanel);

            if (!didUpdate) return nextTab;

            const updated = { ...nextTab, leftPanel, rightPanel };
            // 如果更新的是当前激活标签页，同时更新活跃面板状态
            if (tab.id === state.activeTabId) {
              activeLeftPanel = leftPanel;
              activeRightPanel = rightPanel;
            }
            return updated;
          });

          return { tabs, activeLeftPanel, activeRightPanel };
        });
      },

      // 更新当前激活标签页的左侧面板宽度方法
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

      // 根据ID获取标签页方法
      getTabById: (tabId) => {
        return get().tabs.find((tab) => tab.id === tabId);
      },

      // 获取当前工作区的标签列表方法
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

      // 重新排序标签页方法
      reorderTabs: (
        workspaceId,
        sourceTabId,
        targetTabId,
        position = "before"
      ) => {
        set((state) => {
          if (sourceTabId === targetTabId) return state;

          // 获取指定工作区的标签页并排序（固定在前，普通在后）
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

          // 移除源标签页后调整目标索引
          if (fromIndex < toIndex) {
            targetIndex -= 1;
          }

          // 如果位置是after，目标索引+1
          if (position === "after") {
            targetIndex += 1;
          }

          // 保持固定标签页在普通标签页之前
          if (sourcePinned && !targetPinned) {
            targetIndex = Math.min(targetIndex, Math.max(0, pinnedCount - 1));
          } else if (!sourcePinned && targetPinned) {
            targetIndex = Math.max(targetIndex, pinnedCount);
          }

          // 确保索引在有效范围内
          const lowerBound = sourcePinned ? 0 : pinnedCount;
          const upperBound = sourcePinned
            ? Math.max(pinnedCount - 1, 0)
            : reordered.length;
          const boundedIndex = Math.max(
            lowerBound,
            Math.min(targetIndex, upperBound)
          );
          reordered.splice(boundedIndex, 0, moved);

          // 重建标签页列表，保持其他工作区的标签页不变
          const workspaceQueue = [...reordered];
          const newTabs = state.tabs.map((tab) =>
            tab.workspaceId !== workspaceId
              ? tab
              : (workspaceQueue.shift() as Tab)
          );

          return { tabs: newTabs };
        });
      },

      // 设置标签页是否固定方法
      setTabPinned: (tabId, isPin) => {
        set((state) => {
          const target = state.tabs.find((tab) => tab.id === tabId);
          if (!target) return state;

          // 更新标签页的固定状态
          const updatedTabs = state.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, isPin } : tab
          );

          // 重新排序该工作区的标签页（固定在前，普通在后）
          const workspaceTabs = orderWorkspaceTabs(
            updatedTabs.filter((tab) => tab.workspaceId === target.workspaceId)
          );

          // 重建标签页列表，保持其他工作区的标签页不变
          const workspaceQueue = [...workspaceTabs];
          const newTabs = updatedTabs.map((tab) =>
            tab.workspaceId !== target.workspaceId
              ? tab
              : (workspaceQueue.shift() as Tab)
          );

          return { tabs: newTabs };
        });
      },

      // 向面板添加对话框方法
      addPanelDialog: (side, dialogInput) => {
        set((state) => {
          if (!state.activeTabId) return state;

          const newDialog: PanelDialog = {
            ...dialogInput,
            id: generateDialogId(), // 生成唯一对话框ID
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
                  dialogs: [...currentDialogs, newDialog], // 添加新对话框
                },
              };
            } else {
              const currentDialogs = normalizedTab.rightPanel?.dialogs || [];
              return {
                ...normalizedTab,
                rightPanel: {
                  ...normalizedTab.rightPanel!,
                  dialogs: [...currentDialogs, newDialog], // 添加新对话框
                },
              };
            }
          });

          // 更新活跃面板
          const activeTab = tabs.find((t) => t.id === state.activeTabId);
          return {
            tabs,
            activeLeftPanel: activeTab?.leftPanel,
            activeRightPanel: activeTab?.rightPanel,
          };
        });
      },

      // 从面板移除对话框方法
      removePanelDialog: (side, dialogId) => {
        set((state) => {
          if (!state.activeTabId) return state;

          const tabs = state.tabs.map((tab) => {
            if (tab.id !== state.activeTabId) return tab;

            const normalizedTab = withPanelDefaults(tab);

            if (side === "left" && normalizedTab.leftPanel) {
              const updatedDialogs = (
                normalizedTab.leftPanel.dialogs || []
              ).filter((d) => d.id !== dialogId);
              // 检查移除对话框后面板是否还有内容
              const hasContent =
                normalizedTab.leftPanel.component || updatedDialogs.length > 0;
              return {
                ...normalizedTab,
                leftPanel: {
                  ...normalizedTab.leftPanel,
                  dialogs: updatedDialogs, // 移除指定对话框
                  hidden: !hasContent, // 如果没有内容则隐藏面板
                },
              };
            } else if (side === "right" && normalizedTab.rightPanel) {
              const updatedDialogs = (
                normalizedTab.rightPanel.dialogs || []
              ).filter((d) => d.id !== dialogId);
              // 检查移除对话框后面板是否还有内容
              const hasContent =
                normalizedTab.rightPanel.component || updatedDialogs.length > 0;
              return {
                ...normalizedTab,
                rightPanel: {
                  ...normalizedTab.rightPanel,
                  dialogs: updatedDialogs, // 移除指定对话框
                  hidden: !hasContent, // 如果没有内容则隐藏面板
                },
              };
            }
            return normalizedTab;
          });

          // 更新活跃面板
          const activeTab = tabs.find((t) => t.id === state.activeTabId);
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
