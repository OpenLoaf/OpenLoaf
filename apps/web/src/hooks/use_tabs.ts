import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// 定义标签页类型
interface Tab {
  id: string;
  title: string;
  type: string;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (tab: Omit<Tab, "id"> & { id: string }) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  getTabById: (tabId: string) => Tab | undefined;
}

const STORAGE_KEY = "tabs-storage";

export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      addTab: (tab) => {
        set((state) => {
          // 检查标签页是否已存在
          const existingTab = state.tabs.find((t) => t.id === tab.id);
          if (existingTab) {
            return {
              ...state,
              activeTabId: tab.id,
            };
          }

          return {
            tabs: [...state.tabs, tab],
            activeTabId: tab.id,
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

      getTabById: (tabId) => {
        return get().tabs.find((tab) => tab.id === tabId);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
