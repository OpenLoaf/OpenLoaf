/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Shared node prop types — extracted to break circular dependencies between
 * Node components and their corresponding AiPanel components.
 */
import type { AiGenerateConfig, NodeOrigin } from '../board-contracts'
import type { VersionStack } from '../engine/types'

// ---------------------------------------------------------------------------
// ImageNodeProps
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
  versionStack?: VersionStack
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

// ---------------------------------------------------------------------------
// VideoNodeProps
// ---------------------------------------------------------------------------

export type VideoNodeProps = {
  /** Project-relative path for the video. */
  sourcePath: string
  /** Display name for the video. */
  fileName?: string
  /** Optional poster path for preview. */
  posterPath?: string
  /** Optional duration in seconds. */
  duration?: number
  /** Optional video width in pixels. */
  naturalWidth?: number
  /** Optional video height in pixels. */
  naturalHeight?: number
  /** Clip start time in seconds (default 0). */
  clipStart?: number
  /** Clip end time in seconds (default duration). */
  clipEnd?: number
  /** How the video was created. Defaults to 'upload'. */
  origin?: NodeOrigin
  /** AI generation config. Present only when origin is 'ai-generate'. */
  aiConfig?: AiGenerateConfig
  /** Version stack tracking AI generation history. */
  versionStack?: VersionStack
  /** 平台视频下载任务 id。 */
  downloadTaskId?: string
  /** 平台视频原始链接，用于失败重试。 */
  downloadUrl?: string
  /** 平台视频下载失败信息。 */
  downloadError?: string
}
