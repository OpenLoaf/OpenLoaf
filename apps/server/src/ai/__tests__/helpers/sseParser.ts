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
  output?: unknown
}

export type SseStreamResult = {
  textOutput: string
  toolCalls: SseToolCall[]
  toolNames: string[]
  subAgentEvents: Array<{ type: string; data: unknown }>
  finishReason: string
}

/**
 * 从 SSE 文本流中解析出事件数组。
 */
export function parseSseText(raw: string): SseEvent[] {
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
 * 从 Response 对象解析 SSE 事件。
 */
export async function parseSseResponse(response: Response): Promise<SseEvent[]> {
  const text = await response.text()
  return parseSseText(text)
}

/**
 * 从 SSE 事件中提取 text-delta 并拼接。
 */
export function extractTextFromSseEvents(events: SseEvent[]): string {
  return events
    .filter((e) => e.event === 'text-delta' || (e.data as any)?.type === 'text-delta')
    .map((e) => {
      const d = e.data as any
      return d?.textDelta ?? d?.text ?? ''
    })
    .join('')
}

/**
 * 从 SSE 事件中提取工具调用。
 */
export function extractToolCallsFromSseEvents(events: SseEvent[]): any[] {
  return events.filter(
    (e) => e.event === 'tool-call' || (e.data as any)?.type === 'tool-call',
  )
}

/**
 * 从 Response 对象完整消费 SSE 流，提取文本、工具调用、子 Agent 事件。
 * 用于 E2E Provider 解析 runChatStream() 返回的 SSE Response。
 */
export async function consumeSseResponse(response: Response): Promise<SseStreamResult> {
  const raw = await response.text()
  const events = parseSseText(raw)

  let textOutput = ''
  const toolCalls: SseToolCall[] = []
  const subAgentEvents: Array<{ type: string; data: unknown }> = []
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
        })
        break

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
        }
        break
    }
  }

  return {
    textOutput,
    toolCalls,
    toolNames: [...new Set(toolCalls.map((t) => t.toolName))],
    subAgentEvents,
    finishReason,
  }
}
