import { create } from 'zustand'

interface HeaderSlotState {
  headerActionsTarget: HTMLDivElement | null
  setHeaderActionsTarget: (node: HTMLDivElement | null) => void
  headerTitleExtraTarget: HTMLDivElement | null
  setHeaderTitleExtraTarget: (node: HTMLDivElement | null) => void
  /** Callback to request board rename from header title area. */
  requestBoardRename: (() => void) | null
  setRequestBoardRename: (fn: (() => void) | null) => void
}

export const useHeaderSlot = create<HeaderSlotState>((set) => ({
  headerActionsTarget: null,
  setHeaderActionsTarget: (node) => set({ headerActionsTarget: node }),
  headerTitleExtraTarget: null,
  setHeaderTitleExtraTarget: (node) => set({ headerTitleExtraTarget: node }),
  requestBoardRename: null,
  setRequestBoardRename: (fn) => set({ requestBoardRename: fn }),
}))
