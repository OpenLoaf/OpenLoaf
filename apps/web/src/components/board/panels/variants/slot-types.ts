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

/** Union of all reference types held in a pool */
export type PoolReference = TextReference | MediaReference

/** Type pools keyed by MediaType */
export type ReferencePools = Record<MediaType, PoolReference[]>
