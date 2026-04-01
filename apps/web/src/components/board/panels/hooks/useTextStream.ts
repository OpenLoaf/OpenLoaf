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
 * Hook for consuming the Board Agent text stream (SSE).
 *
 * The backend returns a plain text stream (smoothStream + toTextStreamResponse),
 * which we read via ReadableStream and accumulate into `text`.
 */

import { useCallback, useRef, useState } from 'react'
import { resolveServerUrl } from '@/utils/server-url'
import { getAccessToken } from '@/lib/saas-auth'

export interface TextStreamState {
  /** Accumulated generated text so far. */
  text: string
  /** Whether the stream is currently active. */
  isStreaming: boolean
  /** Error message if the stream failed. */
  error: string | null
  /** Start a new text generation stream. */
  startStream: (body: BoardAgentRequestBody) => void
  /** Abort the current stream. */
  abort: () => void
  /** Clear the result text. */
  clear: () => void
}

export interface BoardAgentRequestBody {
  featureId: string
  instruction: string
  upstreamText?: string
  upstreamImages?: string[]
  upstreamVideos?: string[]
  upstreamAudios?: string[]
  chatModelId?: string
  chatModelSource?: 'local' | 'cloud'
  skillContents?: { name: string; content: string }[]
}

export function useTextStream(): TextStreamState {
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

  const startStream = useCallback((body: BoardAgentRequestBody) => {
    // Abort any existing stream
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setText('')
    setError(null)
    setIsStreaming(true)

    const run = async () => {
      try {
        const base = resolveServerUrl()
        const token = await getAccessToken()
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (token) headers.Authorization = `Bearer ${token}`

        const response = await fetch(`${base}/ai/board-agent`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          let detail = ''
          try {
            const errBody = await response.json()
            detail = errBody?.error ?? ''
          } catch { /* ignore */ }
          throw new Error(detail || `HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          accumulated += chunk
          setText(accumulated)
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

  return { text, isStreaming, error, startStream, abort, clear }
}
