/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
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

export type BoardFileContext = {
  /** Project id used for file resolution. */
  projectId?: string
  /** Project root uri for file resolution. */
  rootUri?: string
  /** Board id used for chat/session association. */
  boardId?: string
  /** Board folder uri for attachment storage. */
  boardFolderUri?: string
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

/** AI generation configuration stored on nodes created by AI. */
export type AiGenerateConfig = {
  /** Model id used for generation. */
  modelId: string
  /** Text prompt used for generation. */
  prompt: string
  /** Negative prompt (optional). */
  negativePrompt?: string
  /** Style preset applied during generation. */
  style?: string
  /** Aspect ratio used for generation. */
  aspectRatio?: 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  /** Upstream node ids used as input references. */
  inputNodeIds?: string[]
  /** Server-side task id for the generation job. */
  taskId?: string
  /** Timestamp when the generation completed. */
  generatedAt?: number
  /** Generated result URLs (when count > 1). */
  results?: Array<{ previewSrc: string; originalSrc: string }>
  /** Currently selected result index. */
  selectedIndex?: number
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
}
