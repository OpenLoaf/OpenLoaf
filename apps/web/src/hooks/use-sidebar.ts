import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
}

const STORAGE_KEY = "sidebar-storage";

const DEFAULT_STATE: Pick<
  SidebarState,
  "leftOpen" | "rightOpen" | "leftPanelWidth" | "rightPanelWidth"
> = {
  leftOpen: true,
  rightOpen: true,
  leftPanelWidth: 20,
  rightPanelWidth: 22,
};

// 初始读取 storage，确保默认值在首次渲染时就使用缓存
const getInitialState = () => {
  if (typeof window === "undefined") return DEFAULT_STATE;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_STATE;

    const parsed = JSON.parse(stored);
    const state = parsed?.state ?? {};

    return {
      leftOpen: state.leftOpen ?? DEFAULT_STATE.leftOpen,
      rightOpen: state.rightOpen ?? DEFAULT_STATE.rightOpen,
      leftPanelWidth: state.leftPanelWidth ?? DEFAULT_STATE.leftPanelWidth,
      rightPanelWidth: state.rightPanelWidth ?? DEFAULT_STATE.rightPanelWidth,
    };
  } catch {
    return DEFAULT_STATE;
  }
};

// 自定义 localStorage 适配器，确保类型正确
const localStorageAdapter = {
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;

    const value = localStorage.getItem(name);
    return value ? JSON.parse(value) : null;
  },
  setItem: (name: string, value: any) => {
    if (typeof window === "undefined") return;

    localStorage.setItem(name, JSON.stringify(value));
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;

    localStorage.removeItem(name);
  },
};

export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({
      ...getInitialState(),
      toggleLeft: () => set((state) => ({ leftOpen: !state.leftOpen })),
      toggleRight: () => set((state) => ({ rightOpen: !state.rightOpen })),
      setLeftOpen: (open) => set({ leftOpen: open }),
      setRightOpen: (open) => set({ rightOpen: open }),
      setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
      setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
    }),
    {
      name: STORAGE_KEY,
      storage: localStorageAdapter,
    }
  )
);
