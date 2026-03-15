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
 * SSE Response 解析工具。
 * 用于解析 agent stream 返回的 SSE 格式数据。
 */

type SseEvent = {
  event?: string
  data: unknown
}

export type SseToolCall = {
  toolCallId: string
  toolName: string
  input?: unknown
  args?: unknown
  output?: unknown
}

export type SseStreamResult = {
  textOutput: string
  toolCalls: SseToolCall[]
  toolNames: string[]
  subAgentEvents: Array<{ type: string; data: unknown }>
  commandEvents: Array<{ type: string; data: unknown }>
  finishReason: string
}

/**
 * 从 SSE 文本流中解析出事件数组。
 */
function parseSseText(raw: string): SseEvent[] {
  const events: SseEvent[] = []
  let currentEvent: string | undefined

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      const dataStr = line.slice(5).trim()
      if (dataStr === '[DONE]') continue
      try {
        events.push({ event: currentEvent, data: JSON.parse(dataStr) })
      } catch {
        events.push({ event: currentEvent, data: dataStr })
      }
      currentEvent = undefined
    }
  }
  return events
}

/**
 * 从 Response 对象完整消费 SSE 流，提取文本、工具调用、子 Agent 事件。
 * 用于 E2E Provider 解析 runChatStream() 返回的 SSE Response。
 */
export async function consumeSseResponse(response: Response): Promise<SseStreamResult> {
  // 手动读取流，处理 string 和 Uint8Array 混合块
  // （AI SDK 的 JsonToSseTransformStream 可能输出字符串而非字节）
  const reader = response.body?.getReader()
  let raw = ''
  if (reader) {
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (typeof value === 'string') {
        raw += value
      } else if (value instanceof Uint8Array) {
        raw += decoder.decode(value, { stream: true })
      }
    }
  }
  const events = parseSseText(raw)

  let textOutput = ''
  const toolCalls: SseToolCall[] = []
  const subAgentEvents: Array<{ type: string; data: unknown }> = []
  const commandEvents: Array<{ type: string; data: unknown }> = []
  let finishReason = ''

  for (const event of events) {
    const d = event.data as any
    if (!d || typeof d !== 'object') continue
    const type: string = d.type ?? event.event ?? ''

    switch (type) {
      case 'text-delta':
        textOutput += d.textDelta ?? d.delta ?? ''
        break

      case 'tool-call':
        toolCalls.push({
          toolCallId: d.toolCallId ?? '',
          toolName: d.toolName ?? '',
          input: d.args,
          args: d.args,
        })
        break

      case 'tool-result': {
        const match = toolCalls.find((t) => t.toolCallId === d.toolCallId)
        if (match) match.output = d.result ?? d.output
        break
      }

      case 'tool-input-available':
        toolCalls.push({
          toolCallId: d.toolCallId ?? '',
          toolName: d.toolName ?? '',
          input: d.input,
          args: d.input,
        })
        break

      case 'tool-input-error': {
        // Capture failed tool calls too — important for asserting tool SELECTION
        // (the model chose the right tool even if parameters were invalid)
        const existingError = toolCalls.find((t) => t.toolCallId === d.toolCallId)
        if (!existingError) {
          toolCalls.push({
            toolCallId: d.toolCallId ?? '',
            toolName: d.toolName ?? '',
            input: d.input,
            args: d.input,
          })
        }
        break
      }

      case 'tool-output-available': {
        const match = toolCalls.find((t) => t.toolCallId === d.toolCallId)
        if (match) match.output = d.output
        break
      }

      case 'finish':
        finishReason = d.finishReason ?? ''
        break

      default:
        if (type.startsWith('data-sub-agent')) {
          subAgentEvents.push({ type, data: d })
        } else if (type.startsWith('data-session-')) {
          commandEvents.push({ type, data: d.data ?? d })
        }
        break
    }
  }

  return {
    textOutput,
    toolCalls,
    toolNames: [...new Set(toolCalls.map((t) => t.toolName))],
    subAgentEvents,
    commandEvents,
    finishReason,
  }
}
