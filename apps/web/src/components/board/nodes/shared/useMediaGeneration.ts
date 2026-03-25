/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { useCallback } from 'react'
import type { CanvasEngine } from '../../engine/CanvasEngine'
import type { InputSnapshot, VersionStack, VersionStackEntry } from '../../engine/types'
import type { BoardFileContext } from '../../board-contracts'
import type { UpstreamData } from '../../engine/upstream-data'
import type { DeriveTargetType } from '../../utils/derive-node'
import {
  createInputSnapshot,
  createGeneratingEntry,
  pushVersion,
  removeFailedEntry,
} from '../../engine/version-stack'
import { resolveErrorMessage } from '../../hooks/useVersionStack'
import type { VersionFailure } from '../../hooks/useVersionStack'
import { deriveNode } from '../../utils/derive-node'
import { resolveAllMediaInputs } from '@/lib/media-upload'

// ---------------------------------------------------------------------------
// Generic generate params — the union shape all media panels share
// ---------------------------------------------------------------------------

/**
 * Common generate params shape shared across all media types.
 * Each node's panel-specific params type is a superset of this.
 */
export type BaseGenerateParams = {
  feature: string
  variant: string
  inputs?: Record<string, unknown>
  params?: Record<string, unknown>
  count?: number
  prompt?: string
}

// ---------------------------------------------------------------------------
// Callback types for per-node customization
// ---------------------------------------------------------------------------

/** Options for the node-specific submit function. */
export type SubmitOptions = {
  projectId?: string
  boardId?: string
  sourceNodeId?: string
}

/**
 * Build the InputSnapshot from generate params.
 * Each node type constructs the snapshot differently — e.g. AudioNode extracts
 * prompt from `inputs.text`, ImageNode includes `aspectRatio` in parameters.
 */
export type BuildSnapshotFn<P extends BaseGenerateParams> = (
  params: P,
  upstream: UpstreamData | null,
) => InputSnapshot

/**
 * Build the props patch to write alongside the pending entry.
 * Typically includes `aiConfig` and optionally `fileName` or other metadata.
 * Called for both the current node (`handleGenerate`) and new derived nodes.
 */
export type BuildGeneratePatchFn<P extends BaseGenerateParams> = (
  params: P,
) => Record<string, unknown>

/** Result from a generate submission — single task or grouped tasks. */
export type GenerateSubmitResult =
  | { taskId: string }
  | { groupId: string; taskIds: string[] }

/**
 * Submit the generation request to the backend.
 * Returns `{ taskId }` or `{ groupId, taskIds }` on success, throws on failure.
 */
export type SubmitGenerateFn<P extends BaseGenerateParams> = (
  params: P,
  options: SubmitOptions,
) => Promise<GenerateSubmitResult>

/**
 * Build retry params from a failed input snapshot.
 * Each node type reconstructs its panel-specific params differently.
 */
export type BuildRetryParamsFn<P extends BaseGenerateParams> = (
  input: InputSnapshot,
) => P

// ---------------------------------------------------------------------------
// Hook configuration
// ---------------------------------------------------------------------------

export type UseMediaGenerationConfig<P extends BaseGenerateParams> = {
  /** Current element id. */
  elementId: string
  /** Current version stack from element props. */
  versionStack: VersionStack | undefined
  /** Board file context for project/board ids. */
  fileContext?: BoardFileContext
  /** Canvas engine instance. */
  engine: CanvasEngine
  /** Upstream data for the current node. */
  upstream: UpstreamData | null
  /** Update the current node's props. */
  onUpdate: (patch: Record<string, unknown>) => void
  /** Set the last failure state (from useVersionStackFailureState). */
  setLastFailure: (failure: VersionFailure | null) => void
  /** Current last failure (for retry). */
  lastFailure: VersionFailure | null

  // ── Per-node callbacks ──

  /** Build the input snapshot from generate params. */
  buildSnapshot: BuildSnapshotFn<P>
  /** Build the props patch written alongside the pending entry. */
  buildGeneratePatch: BuildGeneratePatchFn<P>
  /** Submit the generation request to the backend. */
  submitGenerate: SubmitGenerateFn<P>
  /** Build retry params from a failed input snapshot. */
  buildRetryParams: BuildRetryParamsFn<P>
  /** Target node type for derive-node creation. */
  deriveNodeType: DeriveTargetType

  /**
   * Optional: build extra aiConfig patch for derived nodes.
   * Used by ImageNode to copy cache to new nodes.
   * Falls back to `buildGeneratePatch` when not provided.
   */
  buildDeriveNodePatch?: (params: P) => Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export type UseMediaGenerationReturn<P extends BaseGenerateParams> = {
  /** Handle generation on the current node. */
  handleGenerate: (params: P) => Promise<void>
  /** Retry generation from the last failure. */
  handleRetryGenerate: () => void
  /** Generate into a new derived node. */
  handleGenerateNewNode: (params: P) => Promise<void>
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Shared hook encapsulating the generate / retry / generateNewNode flow
 * common to ImageNode, VideoNode, and AudioNode.
 *
 * The common template:
 * 1. Create InputSnapshot + pending VersionStackEntry (no taskId)
 * 2. Write pending entry to version stack (node shows loading immediately)
 * 3. Submit to API → get taskId
 * 4. Backfill taskId into the entry
 * 5. On failure: remove pending entry + setLastFailure
 *
 * Per-node differences are injected via callback parameters:
 * - `buildSnapshot`: how to construct the InputSnapshot
 * - `buildGeneratePatch`: what extra props to write (aiConfig, fileName, etc.)
 * - `submitGenerate`: which API to call
 * - `buildRetryParams`: how to reconstruct params from a failure snapshot
 * - `deriveNodeType`: what type of node to create for "generate new node"
 */
export function useMediaGeneration<P extends BaseGenerateParams>(
  config: UseMediaGenerationConfig<P>,
): UseMediaGenerationReturn<P> {
  const {
    elementId,
    versionStack,
    fileContext,
    engine,
    upstream,
    onUpdate,
    setLastFailure,
    lastFailure,
    buildSnapshot,
    buildGeneratePatch,
    submitGenerate,
    buildRetryParams,
    deriveNodeType,
    buildDeriveNodePatch,
  } = config

  // ── handleGenerate ──
  const handleGenerate = useCallback(
    async (params: P) => {
      // 逻辑：先写入 generating 状态（无 taskId），让节点立即显示 loading，
      // 再上传媒体输入、提交 API，最后补上 taskId 启动轮询。
      const inputSnapshot = buildSnapshot(params, upstream)
      const pendingEntry = createGeneratingEntry(inputSnapshot, '')
      const extraPatch = buildGeneratePatch(params)

      onUpdate({
        versionStack: pushVersion(versionStack, pendingEntry),
        origin: 'ai-generate',
        ...extraPatch,
      })

      try {
        // 逻辑：上传媒体输入（mask、图片等）到公网 URL，在节点显示 loading 后再执行以避免阻塞 UI。
        const resolvedInputs = await resolveAllMediaInputs(
          params.inputs ?? {},
          fileContext?.boardId,
        )
        const resolvedParams = { ...params, inputs: resolvedInputs }

        const result = await submitGenerate(resolvedParams as P, {
          projectId: fileContext?.projectId,
          boardId: fileContext?.boardId,
          sourceNodeId: elementId,
        })

        // 逻辑：API 返回后补上 taskId，轮询开始。
        // 注意：必须用 pushVersion 重建 entries，因为闭包中的 versionStack 是旧值，
        // 不包含第一次 onUpdate 推入的 pendingEntry。直接读 versionStack?.entries
        // 会导致 pendingEntry 丢失、taskId 无法回填、轮询不启动。
        const firstTaskId = 'taskId' in result ? result.taskId : result.taskIds[0]
        const pushedStack = pushVersion(versionStack, pendingEntry)
        const updatedEntries = pushedStack.entries.map(e =>
          e.id === pendingEntry.id ? { ...e, taskId: firstTaskId } : e,
        )
        onUpdate({
          versionStack: {
            entries: updatedEntries,
            primaryId: pendingEntry.id,
          },
        })
      } catch (error) {
        console.error(`[${deriveNodeType}Node] generation failed:`, error)
        // 逻辑：提交失败时从 stack 中移除 pending entry，设置 lastFailure 显示错误浮层。
        const { stack: cleaned } = removeFailedEntry(
          pushVersion(versionStack, pendingEntry),
          pendingEntry.id,
        )
        onUpdate({ versionStack: cleaned })
        setLastFailure({
          input: inputSnapshot,
          error: {
            code: 'SUBMIT_FAILED',
            message: resolveErrorMessage(error),
          },
        })
      }
    },
    [
      elementId,
      versionStack,
      fileContext,
      upstream,
      onUpdate,
      buildSnapshot,
      buildGeneratePatch,
      submitGenerate,
      deriveNodeType,
      setLastFailure,
    ],
  )

  // ── handleRetryGenerate ──
  const handleRetryGenerate = useCallback(() => {
    if (!lastFailure?.input) return
    const params = buildRetryParams(lastFailure.input)
    handleGenerate(params)
  }, [lastFailure, buildRetryParams, handleGenerate])

  // ── handleGenerateNewNode ──
  const handleGenerateNewNode = useCallback(
    async (params: P) => {
      let newNodeId: string | null = null
      try {
        // 逻辑：创建新的派生节点并在其上提交生成任务。
        newNodeId = deriveNode({
          engine,
          sourceNodeId: elementId,
          targetType: deriveNodeType,
          targetProps: { origin: 'ai-generate' },
        })
        if (!newNodeId) return

        // 逻辑：先写入 generating 状态，让新节点立即显示 loading。
        const inputSnapshot = buildSnapshot(params, null)
        const pendingEntry = createGeneratingEntry(inputSnapshot, '')
        const derivePatch = buildDeriveNodePatch
          ? buildDeriveNodePatch(params)
          : buildGeneratePatch(params)

        engine.doc.updateNodeProps(newNodeId, {
          versionStack: pushVersion(undefined, pendingEntry),
          origin: 'ai-generate',
          ...derivePatch,
        })

        // 逻辑：上传媒体输入（mask、图片等）到公网 URL，在子节点创建后再执行以避免阻塞。
        const resolvedInputs = await resolveAllMediaInputs(
          params.inputs ?? {},
          fileContext?.boardId,
        )
        const resolvedParams = { ...params, inputs: resolvedInputs }

        const result = await submitGenerate(resolvedParams as P, {
          projectId: fileContext?.projectId,
          boardId: fileContext?.boardId,
          sourceNodeId: newNodeId,
        })

        // 逻辑：API 返回后补上 taskId。
        const deriveTaskId = 'taskId' in result ? result.taskId : result.taskIds[0]
        engine.doc.updateNodeProps(newNodeId, {
          versionStack: {
            entries: [{ ...pendingEntry, taskId: deriveTaskId }],
            primaryId: pendingEntry.id,
          },
          ...derivePatch,
        })
      } catch (error) {
        console.error(`[${deriveNodeType}Node] new node generation failed:`, error)
        // 逻辑：提交失败时在新节点上写入失败的 version stack entry，让新节点显示错误浮层。
        if (newNodeId) {
          const msg = resolveErrorMessage(error)
          const snapshot = buildSnapshot(params, null)
          const failedEntry: VersionStackEntry = {
            id: `fail-${Date.now()}`,
            status: 'failed',
            input: snapshot,
            createdAt: Date.now(),
            error: { code: 'SUBMIT_FAILED', message: msg },
          }
          const failPatch = buildGeneratePatch(params)
          engine.doc.updateNodeProps(newNodeId, {
            versionStack: pushVersion(undefined, failedEntry),
            ...failPatch,
          })
        }
      }
    },
    [
      engine,
      elementId,
      fileContext?.projectId,
      fileContext?.boardId,
      deriveNodeType,
      buildSnapshot,
      buildGeneratePatch,
      buildDeriveNodePatch,
      submitGenerate,
    ],
  )

  return {
    handleGenerate,
    handleRetryGenerate,
    handleGenerateNewNode,
  }
}
