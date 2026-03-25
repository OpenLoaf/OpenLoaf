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
import { pollTask, subscribeTaskEvents } from '@/lib/saas-media'

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

/** Max SSE onError retries before giving up. */
const MAX_SSE_ERROR_RETRIES = 3

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMediaTaskPolling(
  options: UseMediaTaskPollingOptions,
): TaskPollingResult {
  const { taskId, taskType, projectId, boardId, enabled = true, onSuccess, onFailure } = options

  const [result, setResult] = useState<TaskPollingResult>({ status: 'idle' })

  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  const onFailureRef = useRef(onFailure)
  onFailureRef.current = onFailure

  // Ref-based guard against React StrictMode double-mount creating duplicate SSE.
  const activeRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!taskId || !enabled) {
      setResult((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }))
      return
    }

    // Prevent duplicate SSE (React Strict Mode double-mount guard).
    if (activeRef.current && !activeRef.current.signal.aborted) return

    const controller = new AbortController()
    activeRef.current = controller

    let terminalReceived = false
    let sseErrorCount = 0
    const startTime = Date.now()
    setResult({ status: 'polling', startedAt: startTime })

    // 超时定时器
    const timeoutMs = TIMEOUT_MS[taskType]
    const timeoutTimer = setTimeout(() => {
      if (terminalReceived) return
      controller.abort()
      const msg = i18next.t('board:polling.errorTimeout', { defaultValue: '生成超时，请重试' })
      setResult({ status: 'timeout', error: msg })
      onFailureRef.current?.(msg)
    }, timeoutMs)

    /** 处理服务端 GET 返回的完整结果。 */
    const handlePollResult = (status: any) => {
      if (controller.signal.aborted) return

      if (!status || status.success !== true || !status.data) {
        const msg = 'Failed to query task status'
        setResult({ status: 'failed', error: msg })
        onFailureRef.current?.(msg)
        return
      }

      if (status.data.status === 'not_found') {
        const msg = 'Task not found'
        setResult({ status: 'failed', error: msg })
        onFailureRef.current?.(msg)
        return
      }

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

      // 仍在运行（queued/running）— GET 返回了非终态，SSE 可能断过但任务仍在。
      setResult({ status: 'polling', startedAt: startTime })
    }

    /** 处理错误。 */
    const handleError = (err: unknown) => {
      if (controller.signal.aborted) return
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
    }

    /** 终态时 GET 取完整结果（含资产持久化）。 */
    const fetchResult = () => {
      if (controller.signal.aborted) return
      pollTask(taskId, {
        projectId: projectId || undefined,
        boardId: boardId || undefined,
      })
        .then(handlePollResult)
        .catch(handleError)
    }

    // SSE 直连 SaaS 订阅任务状态
    const closeSSE = subscribeTaskEvents(taskId, {
      onStatus(status) {
        if (controller.signal.aborted || terminalReceived) return

        if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
          // 终态 → 关闭 SSE，GET 取完整结果
          terminalReceived = true
          closeSSE()
          fetchResult()
        } else {
          // queued / running → 更新进度显示
          setResult({ status: 'polling', startedAt: startTime })
        }
      },
      onError() {
        if (controller.signal.aborted || terminalReceived) return
        sseErrorCount += 1
        if (sseErrorCount > MAX_SSE_ERROR_RETRIES) {
          // SSE 反复断连 → fallback 单次 GET 尝试取结果
          terminalReceived = true
          closeSSE()
          fetchResult()
        }
        // 否则让浏览器 EventSource 自动重连
      },
    })

    return () => {
      controller.abort()
      clearTimeout(timeoutTimer)
      closeSSE()
      if (activeRef.current === controller) {
        activeRef.current = null
      }
    }
  }, [taskId, taskType, projectId, boardId, enabled])

  return result
}
