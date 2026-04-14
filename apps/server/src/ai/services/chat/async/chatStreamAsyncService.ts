/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { randomUUID } from 'node:crypto'
import { logger } from '@/common/logger'
import { streamSessionManager } from '@/ai/services/chat/streamSessionManager'
import type { AiExecuteRequest } from '@/ai/services/chat/types'

type StartAsyncInput = {
  request: AiExecuteRequest
  cookies: Record<string, string>
  /** 执行函数：调用 AiExecuteService.execute 或等价物 */
  executeFn: (input: {
    request: AiExecuteRequest
    cookies: Record<string, string>
    requestSignal: AbortSignal
  }) => Promise<Response>
}

type StartAsyncResult = {
  sessionId: string
  assistantMessageId: string
}

/**
 * 启动异步 LLM 流式会话。
 *
 * 复用现有 AiExecuteService 产生 SSE Response，但在后台消费流并
 * 将 chunk 推送到 StreamSessionManager，不与任何 HTTP 连接绑定。
 */
export async function startChatStreamAsync(
  input: StartAsyncInput,
): Promise<StartAsyncResult> {
  const sessionId = input.request.sessionId ?? ''

  // 幂等检测：如果已有活跃流，直接返回
  const existing = streamSessionManager.get(sessionId)
  if (existing && existing.status === 'streaming') {
    return {
      sessionId,
      assistantMessageId: existing.assistantMessageId,
    }
  }

  // 预生成 assistantMessageId，确保即使 LLM 流无 start chunk 也有有效 ID
  const preGeneratedId = randomUUID()

  // 创建 StreamSession（AbortController 独立于任何 HTTP 请求）
  const sessionHandle = streamSessionManager.create(sessionId, preGeneratedId)

  // 调用现有执行管线，使用 StreamSession 的 AbortController signal
  let response: Response
  try {
    response = await input.executeFn({
      request: input.request,
      cookies: input.cookies,
      requestSignal: sessionHandle.abortController.signal,
    })
  } catch (err) {
    // executeFn 异常时将 session 标记为 error，防止泄漏
    const msg = err instanceof Error ? err.message : 'executeFn failed'
    logger.error({ err, sessionId }, '[chatAsync] executeFn threw')
    streamSessionManager.fail(sessionId, msg)
    throw err
  }

  // 后台消费 SSE 流，将 chunk 推送到 StreamSessionManager
  void consumeResponseStream(sessionId, response).catch((err) => {
    logger.error({ err, sessionId }, '[chatAsync] consume stream failed')
    streamSessionManager.fail(sessionId, err instanceof Error ? err.message : 'Unknown error')
  })

  // 等待 start chunk 以获取 LLM 返回的真实 assistantMessageId
  // 如果超时或未收到 start chunk，使用预生成的 ID
  const assistantMessageId = await waitForAssistantMessageId(sessionId, preGeneratedId)

  return {
    sessionId,
    assistantMessageId,
  }
}

/**
 * 消费 SSE Response 流，将解析后的 JSON chunk 推送到 StreamSessionManager。
 */
async function consumeResponseStream(sessionId: string, response: Response): Promise<void> {
  const body = response.body
  if (!body) {
    streamSessionManager.fail(sessionId, 'Response body is null')
    return
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // 追踪流中的错误信息，用于 finish(finishReason: "error") 检测
  let lastTextContent = ''
  let isErrorFinish = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 解析 SSE 格式：每个 chunk 以 "data: " 开头，以 "\n\n" 结尾
      const lines = buffer.split('\n\n')
      // 最后一个元素可能是不完整的，保留在 buffer 中
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6)
          try {
            const chunk = JSON.parse(jsonStr)

            // 从 start chunk 中提取真实 assistantMessageId（覆盖预生成 ID）
            if (chunk?.type === 'start' && chunk.messageId) {
              const session = streamSessionManager.get(sessionId)
              if (session) {
                session.assistantMessageId = chunk.messageId
              }
            }

            // 追踪 text-delta 内容，用于错误消息提取
            if (chunk?.type === 'text-start') {
              lastTextContent = ''
            }
            if (chunk?.type === 'text-delta' && typeof chunk?.delta === 'string') {
              lastTextContent += chunk.delta
            }
            if (chunk?.type === 'finish' && chunk?.finishReason === 'error') {
              isErrorFinish = true
            }

            streamSessionManager.pushChunk(sessionId, chunk)
          } catch {
            // 无法解析的 chunk，作为原始文本推送
            streamSessionManager.pushChunk(sessionId, { type: 'raw', data: jsonStr })
          }
        }
      }
    }

    // 处理 buffer 中剩余的数据
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ')) {
        try {
          const chunk = JSON.parse(trimmed.slice(6))
          if (chunk?.type === 'text-delta' && typeof chunk?.delta === 'string') {
            lastTextContent += chunk.delta
          }
          if (chunk?.type === 'finish' && chunk?.finishReason === 'error') {
            isErrorFinish = true
          }
          streamSessionManager.pushChunk(sessionId, chunk)
        } catch (parseErr) {
          logger.warn(
            { sessionId, error: parseErr, buffer: trimmed.slice(0, 200) },
            '[chat-stream-async] failed to parse SSE chunk',
          )
        }
      }
    }

    // 错误响应标记 session 为 error，使状态查询和重连行为正确
    if (isErrorFinish) {
      streamSessionManager.fail(sessionId, lastTextContent || 'Stream ended with error')
    } else {
      streamSessionManager.complete(sessionId)
    }
  } catch (err) {
    const session = streamSessionManager.get(sessionId)
    if (session?.status === 'aborted') {
      // 被主动中止，不算错误
      return
    }
    throw err
  } finally {
    reader.releaseLock()
  }
}

/**
 * 等待 assistantMessageId 从 start chunk 中解析出来。
 * 如果超时或流结束未收到 start chunk，使用 fallback ID。
 */
function waitForAssistantMessageId(sessionId: string, fallbackId: string): Promise<string> {
  return new Promise((resolve) => {
    const session = streamSessionManager.get(sessionId)
    if (!session) {
      resolve(fallbackId)
      return
    }
    // 如果 session 已有从 start chunk 更新的真实 ID（非预生成 ID），直接返回
    if (session.assistantMessageId && session.assistantMessageId !== fallbackId) {
      resolve(session.assistantMessageId)
      return
    }

    const timeout = setTimeout(() => {
      unsubscribe()
      // 超时时返回 session 上可能已被更新的 ID，否则用 fallback
      resolve(session.assistantMessageId || fallbackId)
    }, 5000)

    const unsubscribe = streamSessionManager.subscribe(sessionId, (event) => {
      if (event.type === 'chunk') {
        const chunk = event.chunk as any
        if (chunk?.type === 'start' && chunk.messageId) {
          clearTimeout(timeout)
          unsubscribe()
          resolve(chunk.messageId)
        }
      } else {
        // 流已结束但没拿到 start chunk 的 ID
        clearTimeout(timeout)
        unsubscribe()
        resolve(session.assistantMessageId || fallbackId)
      }
    })
  })
}
