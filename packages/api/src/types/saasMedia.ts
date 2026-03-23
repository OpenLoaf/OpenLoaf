/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

// ── v3 media types (SDK 0.1.15+) ──

export { MEDIA_FEATURES } from '@openloaf-saas/sdk'
export type {
  MediaFeatureId,
  V3Feature,
  V3Variant,
  V3GenerateRequest,
  V3TaskResponse,
  V3TaskGroupResponse,
  V3CapabilitiesData,
  V3CapabilitiesResponse,
} from '@openloaf-saas/sdk'

export type MediaSubmitContext = {
  /** Project id for storage scoping. */
  projectId?: string
  /** Save directory relative to the project or global root. */
  saveDir?: string
  /** Source node id for tracing. */
  sourceNodeId?: string
  /** Board id — server resolves save path automatically. */
  boardId?: string
}

export type V3TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type V3TaskResult = {
  taskId: string
  status: V3TaskStatus
  resultUrls?: string[]
  /** STT 识别结果文本 */
  resultText?: string
  creditsConsumed?: number
  error?: { code?: string; message?: string }
}
