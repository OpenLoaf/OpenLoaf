/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

// ---------------------------------------------------------------------------
// Declarative InputSlot type system
// ---------------------------------------------------------------------------

export type MediaType = 'image' | 'video' | 'audio' | 'text'
/** @deprecated 新架构下溢出节点统一进入关联节点区，不再需要插槽级溢出策略 */
export type OverflowStrategy = 'rotate' | 'merge' | 'truncate'
export type TextReferenceMode = 'inline' | 'replace'

/** Declarative input slot definition */
export interface InputSlotDefinition {
  /** Slot identifier, e.g. 'prompt', 'image', 'startFrame' */
  id: string
  mediaType: MediaType
  /** i18n key for the slot label */
  labelKey: string
  /** 0 = optional, 1+ = required */
  min: number
  /** 1 = single, 4 = up to 4 */
  max: number
  allowManualInput: boolean
  overflowStrategy: OverflowStrategy
  /** Text slots only: how the text reference is applied */
  referenceMode?: TextReferenceMode
  /**
   * When true, this slot supports on-canvas painting (e.g. mask overlay).
   * InputSlotBar renders a paint-activation chip and brush controls below it.
   */
  isPaintable?: boolean
}

/** Upstream text reference with identity preserved */
export interface TextReference {
  nodeId: string
  label: string
  content: string
  charCount: number
}

/** Upstream media reference with identity preserved */
export interface MediaReference {
  nodeId: string
  nodeType: string
  /** Browser-friendly URL for display */
  url: string
  /** Original path for API submission */
  path?: string
}

/** Result of assigning upstream data to slots */
export interface SlotAssignment {
  assigned: Record<string, (TextReference | MediaReference)[]>
  overflow: Record<string, (TextReference | MediaReference)[]>
  missingRequired: string[]
}

/**
 * 持久化的插槽分配映射（存入 paramsCache，跨会话恢复）
 * 与运行时的 SlotAssignment 区分：本类型仅记录 slotId → 来源标识
 */
export type PersistedSlotMap = Record<string, string | string[]>
// key: slotId (如 'image', 'mask', 'startFrame')
// value: 单值 slot → nodeId | "manual:<path>"
//        多值 slot (max > 1) → [nodeId, ...] | ["manual:<path>", ...]

/** Union of all reference types held in a pool */
export type PoolReference = TextReference | MediaReference

/** Type pools keyed by MediaType */
export type ReferencePools = Record<MediaType, PoolReference[]>
