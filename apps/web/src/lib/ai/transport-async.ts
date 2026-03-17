/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'
import type { RefObject } from 'react'
import type { ChatRequestBody } from '@openloaf/api/types/message'
import { getWebClientId } from '@/lib/chat/streamClientId'
import { resolveServerUrl } from '@/utils/server-url'
import { isElectronEnv } from '@/utils/is-electron-env'
import { getClientTimeZone } from '@/utils/time-zone'
import { getAccessToken } from '@/lib/saas-auth'

/** 最大重连次数。 */
const MAX_RECONNECT_ATTEMPTS = 5
/** 重连基础延迟 (ms)。 */
const BASE_RECONNECT_DELAY_MS = 100

type AsyncTransportOptions = {
  paramsRef: RefObject<Record<string, unknown> | undefined>
  tabIdRef: RefObject<string | null | undefined>
  sessionIdRef?: RefObject<string | undefined>
}

type AsyncSessionStatus = {
  status: 'streaming' | 'completed' | 'error' | 'aborted' | 'not_found'
  assistantMessageId: string
}

function stripTotalUsageFromMetadata(message: any) {
  if (!message || typeof message !== 'object') return message
  const metadata = (message as any).metadata
  if (!metadata || typeof metadata !== 'object') return message
  const { totalUsage, ...rest } = metadata as any
  const nextMeta = Object.keys(rest).length ? rest : undefined
  return { ...(message as any), metadata: nextMeta }
}

/**
 * 创建 async chat transport。
 *
 * 与默认 transport 的区别：
 * - POST /ai/chat/async 发起对话，立即返回 sessionId
 * - GET /ai/chat/async/stream 消费 SSE 流（可重连）
 * - POST /ai/chat/async/abort 主动中止
 */
export function createChatTransportAsync({
  paramsRef,
  tabIdRef,
  sessionIdRef,
}: AsyncTransportOptions): ChatTransport<UIMessage> {
  // 延迟解析 serverUrl，避免 Electron runtime 未初始化时拿到空字符串
  const getAsyncBase = () => `${resolveServerUrl()}/ai/chat/async`

  return {
    async sendMessages({ messages, body, abortSignal, headers: extraHeaders }) {
      const asyncBase = getAsyncBase()
      const accessToken = await getAccessToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(extraHeaders instanceof Headers
          ? Object.fromEntries(extraHeaders.entries())
          : extraHeaders ?? {}),
      }

      const baseParams = { ...(paramsRef.current ?? {}) }
      const clientId = getWebClientId()
      const tabId = typeof tabIdRef.current === 'string' ? tabIdRef.current : undefined
      const extraBody = body && typeof body === 'object' ? body : {}
      const bodyRecord = extraBody as Record<string, unknown>
      const timezone = getClientTimeZone()
      const {
        params: _ignoredParams,
        id: _ignoredId,
        messages: _ignoredMessages,
        ...restBody
      } = bodyRecord
      const basePayload = { ...baseParams, ...restBody }
      const resolvedSessionId = sessionIdRef?.current ?? (bodyRecord.id as string)

      const lastMessage = messages.length > 0
        ? stripTotalUsageFromMetadata(messages[messages.length - 1])
        : undefined

      const messageLevelBody = (messages[messages.length - 1] as any)?.body
      const chatModelId = typeof messageLevelBody?.chatModelId === 'string'
        ? messageLevelBody.chatModelId
        : undefined

      const payload: ChatRequestBody & Record<string, unknown> = {
        ...basePayload,
        sessionId: resolvedSessionId,
        clientId: clientId || undefined,
        timezone,
        tabId,
        intent: 'chat',
        responseMode: 'stream',
        clientPlatform: isElectronEnv() ? 'desktop' : 'web',
        messages: lastMessage ? [lastMessage] : [],
        ...(chatModelId ? { chatModelId } : {}),
      }

      // 1. POST /ai/chat/async → 启动后台流
      const startRes = await fetch(asyncBase, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
        signal: abortSignal,
      })

      if (!startRes.ok) {
        const errBody = await startRes.text()
        throw new Error(`Failed to start async stream: ${startRes.status} ${errBody}`)
      }

      const { sessionId } = await startRes.json() as {
        sessionId: string
        assistantMessageId: string
      }

      // 2. GET /ai/chat/async/stream → 消费 SSE 并转为 ReadableStream<UIMessageChunk>
      return createChunkStream({
        asyncBase,
        sessionId,
        headers,
        abortSignal,
      })
    },

    async reconnectToStream({ chatId, headers: extraHeaders }) {
      const asyncBase = getAsyncBase()
      const accessToken = await getAccessToken()
      const headers: Record<string, string> = {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(extraHeaders instanceof Headers
          ? Object.fromEntries(extraHeaders.entries())
          : extraHeaders ?? {}),
      }

      // 检查是否有活跃的 async stream
      const statusRes = await fetch(
        `${asyncBase}/status?sessionId=${encodeURIComponent(chatId)}`,
        { headers, credentials: 'include' },
      )
      if (!statusRes.ok) return null
      const status = await statusRes.json() as AsyncSessionStatus
      if (status.status === 'not_found' || status.status === 'completed') return null

      // 重连到活跃流
      return createChunkStream({
        asyncBase,
        sessionId: chatId,
        headers,
      })
    },
  }
}

/** 创建一个将 SSE 流转换为 UIMessageChunk 的 ReadableStream。@internal — exported for testing */
export function createChunkStream(input: {
  asyncBase: string
  sessionId: string
  headers: Record<string, string>
  abortSignal?: AbortSignal
}): ReadableStream<UIMessageChunk> {
  const { asyncBase, sessionId, headers, abortSignal } = input

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      // 追踪最后一个 text part 的内容，用于错误消息提取。
      let lastTextContent = ''
      let errored = false

      try {
        await consumeSseStream({
          asyncBase,
          sessionId,
          headers,
          abortSignal,
          attempt: 0,
          onChunk(chunk: unknown) {
            if (errored) return
            const c = chunk as Record<string, unknown>

            // 每个新 text part 重置累积内容
            if (c?.type === 'text-start') {
              lastTextContent = ''
            }
            if (c?.type === 'text-delta' && typeof c?.delta === 'string') {
              lastTextContent += c.delta
            }

            // 检测 finish(finishReason: "error") — 主动让 ReadableStream 报错，
            // 使 useChat 设置 chat.error，前端渲染为错误卡片而非普通消息。
            if (c?.type === 'finish' && c?.finishReason === 'error') {
              errored = true
              controller.error(new Error(lastTextContent || 'AI request failed'))
              return
            }

            controller.enqueue(chunk as UIMessageChunk)
          },
          onDone() {
            if (!errored) controller.close()
          },
          onError(err: Error) {
            if (!errored) controller.error(err)
          },
        })
      } catch (err) {
        if (!errored) controller.error(err)
      }
    },
    cancel() {
      // 取消时中止后台流
      void abortAsyncStream(sessionId)
    },
  })
}

/** 消费 SSE 流，支持断线重连。@internal — exported for testing */
export async function consumeSseStream(input: {
  asyncBase: string
  sessionId: string
  headers: Record<string, string>
  abortSignal?: AbortSignal
  attempt: number
  onChunk: (chunk: unknown) => void
  onDone: () => void
  onError: (err: Error) => void
}): Promise<void> {
  const {
    asyncBase, sessionId, headers, abortSignal,
    onChunk, onDone, onError,
  } = input
  let { attempt } = input

  const streamUrl = `${asyncBase}/stream?sessionId=${encodeURIComponent(sessionId)}`
  let response: Response
  try {
    response = await fetch(streamUrl, { headers, credentials: 'include', signal: abortSignal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      onDone()
      return
    }
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      const delay = BASE_RECONNECT_DELAY_MS * 2 ** attempt
      await new Promise((r) => setTimeout(r, delay))
      return consumeSseStream({ ...input, attempt: attempt + 1 })
    }
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }

  if (!response.ok) {
    if (response.status === 404) {
      onError(new Error('Session not found'))
      return
    }
    onError(new Error(`Stream connection failed: ${response.status}`))
    return
  }

  const body = response.body
  if (!body) {
    onError(new Error('Response body is null'))
    return
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let hasReceivedData = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        onDone()
        return
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        try {
          const chunk = JSON.parse(trimmed.slice(6))
          onChunk(chunk)
          hasReceivedData = true
        } catch {}
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      onDone()
      return
    }

    reader.releaseLock()

    // 成功读取数据后重置 attempt，确保长流多次断线不会耗尽重连次数
    const nextAttempt = hasReceivedData ? 0 : attempt + 1
    if (nextAttempt < MAX_RECONNECT_ATTEMPTS) {
      const delay = BASE_RECONNECT_DELAY_MS * 2 ** nextAttempt
      await new Promise((r) => setTimeout(r, delay))
      return consumeSseStream({ ...input, attempt: nextAttempt })
    }

    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }
}

/**
 * 查询 async 流状态。
 * 可用于 session 切换时检查是否有活跃流。
 */
export async function queryAsyncStreamStatus(
  sessionId: string,
): Promise<AsyncSessionStatus | null> {
  try {
    const serverUrl = resolveServerUrl()
    const res = await fetch(
      `${serverUrl}/ai/chat/async/status?sessionId=${encodeURIComponent(sessionId)}`,
    )
    if (!res.ok) return null
    return await res.json() as AsyncSessionStatus
  } catch {
    return null
  }
}

/**
 * 主动中止 async 流。
 */
export async function abortAsyncStream(sessionId: string): Promise<void> {
  try {
    const serverUrl = resolveServerUrl()
    const accessToken = await getAccessToken()
    await fetch(`${serverUrl}/ai/chat/async/abort`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ sessionId }),
    })
  } catch {}
}
