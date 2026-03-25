/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { V3Variant } from '@/lib/saas-media'
import type {
  MediaReference,
  PersistedSlotMap,
} from './slot-types'

/** Upstream data piped from connected nodes. */
export interface VariantUpstream {
  textContent?: string
  /** Resolved browser-friendly URLs for display/thumbnails. */
  images?: string[]
  /** Raw board-relative paths for API submission (e.g. "asset/xxx.jpg"). */
  imagePaths?: string[]
  audioUrl?: string
  videoUrl?: string
  /** Board context for MediaSlot preview resolution & file saving. */
  boardId?: string
  projectId?: string
  boardFolderUri?: string
}

/** Snapshot of variant form params — used for caching and restoring. */
export interface VariantParamsSnapshot {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
  slotAssignment?: PersistedSlotMap  // 新增
}

/** Common props shared by all variant form components. */
export interface VariantFormProps {
  /** The selected v3 variant descriptor. */
  variant: V3Variant
  /** Upstream data from connected nodes. */
  upstream: VariantUpstream
  /** Resolved browser-friendly URL of the node's existing image resource (for display). */
  nodeResourceUrl?: string
  /** Raw board-relative path of the node's existing image resource (for API submission). */
  nodeResourcePath?: string
  /** When true, all inputs are disabled (readonly / generating state). */
  disabled?: boolean
  /** Previously cached params for this variant — used to restore form state. */
  initialParams?: VariantParamsSnapshot
  /** Called whenever any form field changes with the latest params snapshot. */
  onParamsChange: (params: VariantParamsSnapshot) => void
  /** Report a blocking warning (e.g. "需要源图片"). Set to null/undefined to clear. */
  onWarningChange?: (warning: string | null) => void
  /** 框架层分配结果：slotId → 已分配的媒体引用列表 */
  resolvedSlots?: Record<string, MediaReference[]>  // 新增：框架层分配结果
}

// ---------------------------------------------------------------------------
// V3 辅助类型
// ---------------------------------------------------------------------------

/** @deprecated No longer used — slots are API-driven, no source distinction. */
export type SlotSource = 'pool' | 'self' | 'paint'

export interface ResolveContext {
  params: Record<string, unknown>
  variantId: string
  slots: Record<string, boolean>
  modes: Record<string, string>
}

export interface ParamOption {
  value: string | number | boolean
  label: string
  thumbnail?: string
}

export interface ParamFieldBase {
  key: string
  label: string
  default?: unknown
  group?: 'primary' | 'advanced'
  visible?: (ctx: ResolveContext) => boolean
  clientOnly?: boolean
  hint?: string
}

export interface SelectField extends ParamFieldBase {
  type: 'select'
  options?: ParamOption[]
  catalog?: string
  display?: 'dropdown' | 'grid' | 'pills'
  searchable?: boolean
}

export interface BooleanField extends ParamFieldBase {
  type: 'boolean'
}

export interface TextField extends ParamFieldBase {
  type: 'text'
  multiline?: boolean
  placeholder?: string
}

export interface SliderField extends ParamFieldBase {
  type: 'slider'
  min: number
  max: number
  step?: number
}

export interface NumberField extends ParamFieldBase {
  type: 'number'
  min?: number
  max?: number
  step?: number
}

export interface TabField extends ParamFieldBase {
  type: 'tab'
  options: ParamOption[]
}

export type ParamField =
  | SelectField
  | BooleanField
  | TextField
  | SliderField
  | NumberField
  | TabField

/** V3 媒体输入引用 */
export interface MediaInput {
  url?: string
  path?: string
}
