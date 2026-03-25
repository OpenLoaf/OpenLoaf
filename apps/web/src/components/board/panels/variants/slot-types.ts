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

/**
 * 持久化的插槽分配映射（存入 cache，跨会话恢复）
 */
export type PersistedSlotMap = Record<string, string | string[]>
// key: slotId (如 'image', 'mask', 'startFrame')
// value: 单值 slot → nodeId | "manual:<path>"
//        多值 slot (max > 1) → [nodeId, ...] | ["manual:<path>", ...]

/** Union of all reference types held in a pool */
export type PoolReference = TextReference | MediaReference

/** Type pools keyed by MediaType */
export type ReferencePools = Record<MediaType, PoolReference[]>

// ---------------------------------------------------------------------------
// V3 Slot 类型（纯 API 驱动，SDK v0.1.26+）
// ---------------------------------------------------------------------------

/** V3 单值插槽 */
export interface V3InputSlotDefinition {
  /** Semantic role, also used as request `inputs[role]` field name. */
  role: string
  label: string
  accept: MediaType | 'file'
  min?: number  // 默认 1（required）
  max?: number  // 默认 1
  allowUpload?: boolean  // 默认 true
  referenceMode?: 'inline' | 'replace'
  /** Hint text displayed as tooltip next to label. */
  hint?: string
  /** Cross-slot capacity group name. */
  sharedGroup?: string
  /** Total max count across all slots in the same sharedGroup. */
  sharedMaxCount?: number
  // ---- Input constraints (SDK v0.1.27) ----
  /** Text: minimum character length. */
  minLength?: number
  /** Text: maximum character length. */
  maxLength?: number
  /** Media: maximum file size in bytes. */
  maxFileSize?: number
  /** Media: allowed file format extensions. */
  acceptFormats?: string[]
  /** Image/Video: minimum pixel dimension (px). */
  minResolution?: number
  /** Image/Video: maximum pixel dimension (px). */
  maxResolution?: number
  /** Audio/Video: minimum duration in seconds. */
  minDuration?: number
  /** Audio/Video: maximum duration in seconds. */
  maxDuration?: number
}

/** V3 多元素插槽 */
export interface MultiSlotDefinition extends Omit<V3InputSlotDefinition, 'max'> {
  kind: 'multi'
  max: number
  refPrefix?: string
}

/** 任务引用插槽 */
export interface TaskRefSlot {
  kind: 'taskRef'
  role: string
  label: string
  fromVariants?: string[]
  required?: boolean
}

export type AnySlot = V3InputSlotDefinition | MultiSlotDefinition | TaskRefSlot
