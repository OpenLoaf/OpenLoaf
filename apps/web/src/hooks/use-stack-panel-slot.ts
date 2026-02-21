'use client'

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export type StackPanelSlot = {
  /** 在关闭按钮前渲染的额外内容（如保存按钮）。 */
  rightSlotBeforeClose?: ReactNode
  /** 关闭前拦截回调，返回 false 阻止关闭。 */
  onBeforeClose?: () => boolean
}

export type StackPanelSlotContext = {
  setSlot: (slot: StackPanelSlot | null) => void
}

export const StackPanelSlotCtx = createContext<StackPanelSlotContext | null>(
  null,
)

/** 子组件调用此 hook 向 PanelFrame 的 StackHeader 注入额外插槽。 */
export function useStackPanelSlot() {
  return useContext(StackPanelSlotCtx)
}
