import { create } from 'zustand';

interface SidebarState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftPanelWidth: number;
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftPanelWidth: (width: number) => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  leftOpen: true,
  rightOpen: true,
  leftPanelWidth: 18,
  toggleLeft: () => set((state) => ({ leftOpen: !state.leftOpen })),
  toggleRight: () => set((state) => ({ rightOpen: !state.rightOpen })),
  setLeftOpen: (open) => set({ leftOpen: open }),
  setRightOpen: (open) => set({ rightOpen: open }),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
}));
