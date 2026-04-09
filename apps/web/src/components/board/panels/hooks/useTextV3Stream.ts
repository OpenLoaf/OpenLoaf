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
 * Hook for consuming the v3 text generate stream (SSE).
 *
 * The SaaS SDK's v3TextGenerateStream returns a raw Response with SSE events.
 * Each SSE event's `data` field is an OpenAI chat completions chunk:
 *   { choices: [{ delta: { content: '...' } }] }
 *
 * We parse the SSE stream and accumulate delta.content into `text`.
 */

import { useCallback, useRef, useState } from 'react'
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

/**
 * Parse a single SSE data line and extract delta content.
 * Returns the content string or null if not applicable.
 */
function extractDeltaContent(dataStr: string): string | null {
  if (dataStr === '[DONE]') return null
  try {
    const parsed = JSON.parse(dataStr)
    // OpenAI chat completion chunk format
    const deltaContent = parsed?.choices?.[0]?.delta?.content
    if (typeof deltaContent === 'string') return deltaContent || null
    // Simplified format: { content: "..." }
    if (typeof parsed?.content === 'string') return parsed.content || null
    return null
  } catch {
    // Not valid JSON — might be plain text chunk from some providers
    return dataStr
  }
}

export function useTextV3Stream(): TextV3StreamState {
  const [text, setText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
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
      const t0 = performance.now()
      console.log('[V3Stream] startStream called', { feature: payload.feature, variant: payload.variant })
      try {
        const response = await submitV3TextStream(payload)
        console.log('[V3Stream] response received', {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get('content-type'),
          contentEncoding: response.headers.get('content-encoding'),
          elapsed: `${(performance.now() - t0).toFixed(0)}ms`,
        })

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
        let buffer = ''
        let chunkIndex = 0

        while (true) {
          if (controller.signal.aborted) break
          const { done, value } = await reader.read()
          if (done) {
            console.log('[V3Stream] reader done', { totalChunks: chunkIndex, elapsed: `${(performance.now() - t0).toFixed(0)}ms` })
            break
          }

          const decoded = decoder.decode(value, { stream: true })
          console.log(`[V3Stream] chunk#${chunkIndex}`, {
            bytes: value.byteLength,
            decodedLen: decoded.length,
            elapsed: `${(performance.now() - t0).toFixed(0)}ms`,
            preview: decoded.slice(0, 120),
          })
          chunkIndex++
          buffer += decoded

          // Process complete SSE events (separated by double newlines)
          const events = buffer.split('\n\n')
          // Keep the last potentially incomplete chunk in buffer
          buffer = events.pop() ?? ''

          for (const event of events) {
            if (!event.trim()) continue
            // Extract data lines from the event
            for (const line of event.split('\n')) {
              if (line.startsWith('data: ') || line.startsWith('data:')) {
                const dataStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
                const content = extractDeltaContent(dataStr.trim())
                if (content) {
                  accumulated += content
                  setText(accumulated)
                }
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          for (const line of buffer.split('\n')) {
            if (line.startsWith('data: ') || line.startsWith('data:')) {
              const dataStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
              const content = extractDeltaContent(dataStr.trim())
              if (content) {
                accumulated += content
                setText(accumulated)
              }
            }
          }
        }

        console.log('[V3Stream] stream complete', { totalLength: accumulated.length, elapsed: `${(performance.now() - t0).toFixed(0)}ms` })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Stream failed'
        console.error('[V3Stream] error', { msg, elapsed: `${(performance.now() - t0).toFixed(0)}ms` })
        setError(msg)
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    }

    void run()
  }, [])

  return { text, isStreaming, error, startStream, abort, clear }
}
