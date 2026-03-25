/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { PersistedSlotMap } from './panels/variants/slot-types'

export type { BoardFileContext } from './engine/types'

export type ImagePreviewPayload = {
  /** Original image uri. */
  originalSrc: string;
  /** Preview image source. */
  previewSrc: string;
  /** File name for alt text. */
  fileName: string;
  /** MIME type for the original image. */
  mimeType?: string;
}

export type LinkNodeProps = {
  /** Destination URL. */
  url: string
  /** Title text shown in card mode. */
  title: string
  /** Description text shown in card mode. */
  description: string
  /** Logo URL for title/card mode. */
  logoSrc: string
  /** Preview image URL for card mode. */
  imageSrc: string
  /** Refresh token used to trigger reloads. */
  refreshToken: number
}

// ---------------------------------------------------------------------------
// AI generation shared types
// ---------------------------------------------------------------------------

/** Node content origin — tracks how the node was created. */
export type NodeOrigin = 'user' | 'upload' | 'ai-generate' | 'paste'

/** Snapshot of variant form params — used for caching and restoring. */
export interface VariantSnapshot {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  slotAssignment?: PersistedSlotMap
  /** Raw user-typed text per text slot (preserves @ref{nodeId} tokens). */
  userTexts?: Record<string, string>
}

/** AI generation configuration stored on nodes created by AI. */
export type AiGenerateConfig = {
  /** Last used feature + variant — restored when panel opens. */
  lastUsed?: { feature: string; variant: string }
  /** Cached variant form params keyed by "feature:variantId". */
  cache?: Record<string, VariantSnapshot>
  /** Metadata written only when a generation completes. */
  lastGeneration?: {
    prompt: string
    feature: string
    variant: string
    aspectRatio?: string
    generatedAt: number
  }
}

// ---------------------------------------------------------------------------
// Node props
// ---------------------------------------------------------------------------

export type ImageNodeProps = {
  /** Compressed preview for rendering on the canvas. */
  previewSrc: string
  /** Original image uri used for download/copy actions. */
  originalSrc: string
  /** MIME type for the original image. */
  mimeType: string
  /** Suggested file name for downloads. */
  fileName: string
  /** Original image width in pixels. */
  naturalWidth: number
  /** Original image height in pixels. */
  naturalHeight: number
  /** Whether the node is waiting on a transcode job. */
  isTranscoding?: boolean
  /** Label shown while the image is transcoding. */
  transcodingLabel?: string
  /** Transcoding task id for async updates. */
  transcodingId?: string
  /** How the image was created. Defaults to 'upload'. */
  origin?: NodeOrigin
  /** AI generation config. Present only when origin is 'ai-generate'. */
  aiConfig?: AiGenerateConfig
  /** Version stack tracking AI generation history. */
  versionStack?: import('./engine/types').VersionStack
  /** Original untransformed image URI — backed up on first image adjust. */
  rawOriginalSrc?: string
  /** Image adjustment state preserved for re-editing. */
  imageAdjust?: {
    rotation: number
    flipH: boolean
    flipV: boolean
    cropRect?: { x: number; y: number; width: number; height: number }
    aspectRatio?: string
  }
}
