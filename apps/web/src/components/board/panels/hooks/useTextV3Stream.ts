/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Hook for consuming the v3 text generate stream.
 *
 * The SaaS SDK's v3TextGenerateStream returns a raw Response.
 * The response is an AI SDK UI Message Stream (SSE framed `data: {...}` lines)
 * where text content is carried in `text-delta` events. We parse SSE here and
 * accumulate only the `delta` strings from `text-delta` events.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { submitV3TextStream, type V3TextGenerateRequest } from '@/lib/saas-media'

export interface TextV3StreamState {
  /** Accumulated generated text so far. */
  text: string
  /** Whether the stream is currently active. */
  isStreaming: boolean
  /** Error message if the stream failed. */
  error: string | null
  /** Start a new text generation stream. */
  startStream: (payload: V3TextGenerateRequest) => void
  /** Abort the current stream. */
  abort: () => void
  /** Clear the result text and error. */
  clear: () => void
}

export function useTextV3Stream(): TextV3StreamState {
  const [text, setText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    // 逻辑：abort 必须同时清 text 并上报错误，否则调用方会把半截文本当作"已完成"写入。
    setText('')
    setIsStreaming(false)
    setError('aborted')
  }, [])

  const clear = useCallback(() => {
    setText('')
    setError(null)
  }, [])

  const startStream = useCallback((payload: V3TextGenerateRequest) => {
    // Abort any existing stream
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setText('')
    setError(null)
    setIsStreaming(true)

    const run = async () => {
      try {
        const response = await submitV3TextStream(payload)

        if (!response.ok) {
          let detail = ''
          try {
            const errBody = await response.json()
            detail = errBody?.message ?? errBody?.error?.message ?? ''
          } catch { /* ignore */ }
          throw new Error(detail || `HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let accumulated = ''
        let sseBuffer = ''

        // 逻辑：后端用 AI SDK 的 UI Message Stream（SSE），每行 `data: {...}`。
        // 我们只关心 `text-delta` 事件的 delta 字段，其它事件（start/finish/usage）忽略。
        const handleLine = (rawLine: string) => {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) return
          const payload = line.slice('data:'.length).trim()
          if (!payload || payload === '[DONE]') return
          try {
            const evt = JSON.parse(payload) as { type?: string; delta?: unknown }
            if (evt.type === 'text-delta' && typeof evt.delta === 'string') {
              accumulated += evt.delta
              setText(accumulated)
            }
          } catch {
            // 非 JSON 行忽略
          }
        }

        while (true) {
          if (controller.signal.aborted) break
          const { done, value } = await reader.read()
          if (done) {
            if (sseBuffer) handleLine(sseBuffer)
            break
          }

          sseBuffer += decoder.decode(value, { stream: true })
          let newlineIndex = sseBuffer.indexOf('\n')
          while (newlineIndex >= 0) {
            const line = sseBuffer.slice(0, newlineIndex)
            sseBuffer = sseBuffer.slice(newlineIndex + 1)
            handleLine(line)
            newlineIndex = sseBuffer.indexOf('\n')
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Stream failed'
        setError(msg)
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    }

    void run()
  }, [])

  // 逻辑：组件卸载时 abort 正在跑的 fetch，防止 setState-on-unmounted + 配额浪费。
  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
    [],
  )

  // 逻辑：用 useMemo 稳定返回引用，避免调用方 effect 因 stream 对象身份变化反复触发。
  return useMemo<TextV3StreamState>(
    () => ({ text, isStreaming, error, startStream, abort, clear }),
    [text, isStreaming, error, startStream, abort, clear],
  )
}
