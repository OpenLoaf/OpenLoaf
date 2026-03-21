/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef, useState } from 'react'
import i18next from 'i18next'
import { pollTask } from '@/lib/saas-media'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaTaskType = 'image_generate' | 'video_generate' | 'audio_generate'

export type TaskPollingStatus = 'idle' | 'polling' | 'succeeded' | 'failed' | 'timeout'

export type TaskPollingResult = {
  status: TaskPollingStatus
  progress?: number
  progressText?: string
  resultUrls?: string[]
  error?: string
  /** Timestamp (ms) when polling started — used for countdown display. */
  startedAt?: number
}

export type UseMediaTaskPollingOptions = {
  taskId: string | undefined
  taskType: MediaTaskType
  projectId?: string
  /** @deprecated Use boardId instead. */
  saveDir?: string
  /** Board id — server resolves the save path automatically. */
  boardId?: string
  /** Set to `false` to pause polling. Defaults to `true`. */
  enabled?: boolean
  onSuccess?: (resultUrls: string[], metadata?: Record<string, unknown>) => void
  onFailure?: (error: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max timeout per task type (ms). */
const TIMEOUT_MS: Record<MediaTaskType, number> = {
  image_generate: 3 * 60 * 1000,
  video_generate: 5 * 60 * 1000,
  audio_generate: 2 * 60 * 1000,
}

/** Max poll attempts (safety net alongside the wall-clock timeout). */
const MAX_ATTEMPTS = 300

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute poll delay with exponential backoff: 2s -> 5s -> 10s. */
function getPollDelay(attempt: number): number {
  if (attempt < 30) return 2000
  if (attempt < 60) return 5000
  return 10000
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMediaTaskPolling(
  options: UseMediaTaskPollingOptions,
): TaskPollingResult {
  const { taskId, taskType, projectId, saveDir, boardId, enabled = true, onSuccess, onFailure } = options

  const [result, setResult] = useState<TaskPollingResult>({ status: 'idle' })

  // Keep mutable refs for callbacks so the polling loop always invokes the
  // latest version without restarting the effect.
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  const onFailureRef = useRef(onFailure)
  onFailureRef.current = onFailure

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Gate: only poll when we have a task id and polling is enabled.
    if (!taskId || !enabled) {
      setResult((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }))
      return
    }

    // Prevent duplicate polling (React Strict Mode double-mount guard).
    // Check `.signal.aborted` so mount2 proceeds when mount1's controller was
    // already aborted by cleanup1 but the async `finally` hasn't cleared the ref yet.
    if (abortRef.current && !abortRef.current.signal.aborted) return

    const controller = new AbortController()
    abortRef.current = controller

    const startTime = Date.now()
    setResult({ status: 'polling', startedAt: startTime })
    const timeoutMs = TIMEOUT_MS[taskType]

    const run = async () => {
      try {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          if (controller.signal.aborted) return

          // Wall-clock timeout check.
          if (Date.now() - startTime > timeoutMs) {
            const msg = i18next.t('board:polling.errorTimeout', { defaultValue: '生成超时，请重试' })
            setResult({ status: 'timeout', error: msg })
            onFailureRef.current?.(msg)
            return
          }

          const status = await pollTask(taskId, {
            projectId: projectId || undefined,
            saveDir: saveDir || undefined,
            boardId: boardId || undefined,
          })

          // Abort check after await.
          if (controller.signal.aborted) return

          // Invalid response.
          if (!status || status.success !== true || !status.data) {
            const msg = 'Failed to query task status'
            setResult({ status: 'failed', error: msg })
            onFailureRef.current?.(msg)
            return
          }

          // Task not found (e.g. server restart lost context).
          if (status.data.status === 'not_found') {
            const msg = 'Task not found'
            setResult({ status: 'failed', error: msg })
            onFailureRef.current?.(msg)
            return
          }

          // ------ Succeeded ------
          if (status.data.status === 'succeeded') {
            const resultUrls = Array.isArray(status.data.resultUrls)
              ? status.data.resultUrls.filter(
                  (url: unknown): url is string =>
                    typeof url === 'string' && url.trim().length > 0,
                )
              : []

            if (resultUrls.length === 0) {
              const msg = i18next.t('board:polling.errorNoResults', { defaultValue: '生成完成但未返回结果，请重试' })
              setResult({ status: 'failed', error: msg })
              onFailureRef.current?.(msg)
              return
            }

            setResult({ status: 'succeeded', resultUrls })
            onSuccessRef.current?.(resultUrls, status.data.metadata ?? undefined)
            return
          }

          // ------ Failed / Canceled ------
          if (status.data.status === 'failed' || status.data.status === 'canceled') {
            const rawMsg: string = status.data.error?.message || ''
            const raw = rawMsg.toLowerCase()
            let msg: string
            if (status.data.status === 'canceled') {
              msg = rawMsg || 'Task was cancelled'
            } else if (raw.includes('insufficient') || raw.includes('balance') || raw.includes('credit') || raw.includes('quota')) {
              msg = i18next.t('board:polling.errorInsufficientBalance', { defaultValue: '账户余额不足，请充值后重试' })
            } else if (raw.includes('rate') || raw.includes('too many') || raw.includes('limit')) {
              msg = i18next.t('board:polling.errorRateLimit', { defaultValue: '请求过于频繁，请稍后重试' })
            } else if (raw.includes('content') || raw.includes('policy') || raw.includes('safety') || raw.includes('nsfw')) {
              msg = i18next.t('board:polling.errorContentPolicy', { defaultValue: '内容不符合安全规范，请修改后重试' })
            } else {
              msg = rawMsg || i18next.t('board:polling.errorGeneric', { defaultValue: '生成失败，请重试' })
            }
            setResult({ status: 'failed', error: msg })
            onFailureRef.current?.(msg)
            return
          }

          // ------ Still running — update progress if available ------
          const progress =
            typeof status.data.progress === 'number' ? status.data.progress : undefined
          setResult({
            status: 'polling',
            progress,
            progressText: progress !== undefined ? `${progress}%` : 'Generating...',
            startedAt: startTime,
          })

          // Backoff wait.
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, getPollDelay(attempt))
            // Allow abort to break out of the wait.
            const onAbort = () => {
              clearTimeout(timer)
              resolve()
            }
            controller.signal.addEventListener('abort', onAbort, { once: true })
          })
        }

        // Exhausted max attempts without a terminal state.
        const msg = i18next.t('board:polling.errorTimeout', { defaultValue: '生成超时，请重试' })
        setResult({ status: 'timeout', error: msg })
        onFailureRef.current?.(msg)
      } catch (err) {
        if (controller.signal.aborted) return
        // 逻辑：HTTP 错误或网络异常对用户不友好，统一转为可读提示。
        let msgKey = 'board:polling.errorGeneric'
        if (err instanceof Error) {
          const raw = err.message.toLowerCase()
          if (raw.includes('insufficient') || raw.includes('balance') || raw.includes('credit') || raw.includes('quota') || raw.includes('402')) {
            msgKey = 'board:polling.errorInsufficientBalance'
          } else if (raw.includes('not found') || raw.includes('404')) {
            msgKey = 'board:polling.errorNotFound'
          } else if (raw.includes('network') || raw.includes('fetch') || raw.includes('timeout') || raw.includes('econnrefused')) {
            msgKey = 'board:polling.errorNetwork'
          } else if (raw.includes('401') || raw.includes('403') || raw.includes('unauthorized')) {
            msgKey = 'board:polling.errorAuth'
          } else if (raw.includes('429') || raw.includes('rate') || raw.includes('too many')) {
            msgKey = 'board:polling.errorRateLimit'
          } else if (raw.includes('500') || raw.includes('502') || raw.includes('503')) {
            msgKey = 'board:polling.errorServer'
          }
        }
        const msg = i18next.t(msgKey, { defaultValue: '生成失败，请重试' })
        setResult({ status: 'failed', error: msg })
        onFailureRef.current?.(msg)
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    }

    run()

    return () => {
      controller.abort()
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [taskId, taskType, projectId, saveDir, enabled])

  return result
}
