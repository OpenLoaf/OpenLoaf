import { create } from 'zustand'

interface HeaderSlotState {
  headerActionsTarget: HTMLDivElement | null
  setHeaderActionsTarget: (node: HTMLDivElement | null) => void
  headerTitleExtraTarget: HTMLDivElement | null
  setHeaderTitleExtraTarget: (node: HTMLDivElement | null) => void
}

export const useHeaderSlot = create<HeaderSlotState>((set) => ({
  headerActionsTarget: null,
  setHeaderActionsTarget: (node) => set({ headerActionsTarget: node }),
  headerTitleExtraTarget: null,
  setHeaderTitleExtraTarget: (node) => set({ headerTitleExtraTarget: node }),
}))
