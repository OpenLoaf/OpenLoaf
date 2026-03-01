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
 * Promptfoo 自定义 Provider — 包装 Master Agent 为 Promptfoo ProviderResponse。
 *
 * 运行方式：通过 promptfooconfig.yaml 中 `file://openloaf-agent-provider.ts` 加载。
 * 需配合 tsx/esm + registerMdTextLoader 运行（由 package.json 脚本保证）。
 */
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from 'promptfoo'
import { createMasterAgentRunner } from '@/ai/services/masterAgentRunner'
import {
  resolveTestModel,
  setMinimalRequestContext,
  setChatModel,
  setAbortSignal,
} from '../helpers/testEnv'

type ToolCallRecord = {
  toolCallId?: string
  name: string
  input: unknown
  output: unknown
}

export default class OpenLoafAgentProvider implements ApiProvider {
  private config: { toolIds?: string[] }

  constructor(options?: { config?: Record<string, unknown> }) {
    this.config = (options?.config ?? {}) as { toolIds?: string[] }
  }

  id() {
    return 'openloaf-agent'
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const start = Date.now()

    try {
      // 1. 解析模型 + 设置上下文
      const resolved = await resolveTestModel()
      setMinimalRequestContext()
      setChatModel(resolved.model)
      const ac = new AbortController()
      setAbortSignal(ac.signal)

      // 若外部传入 abortSignal，联动取消
      if (options?.abortSignal) {
        options.abortSignal.addEventListener('abort', () => ac.abort(), { once: true })
      }

      // 2. 获取工具集（优先从 test vars，其次 provider config）
      // 注意：Promptfoo vars 中的数组会被展开为多个测试，所以 toolIds 以 JSON 字符串传入
      const rawToolIds = context?.vars?.toolIds ?? this.config.toolIds
      const toolIds: string[] | undefined =
        typeof rawToolIds === 'string' ? JSON.parse(rawToolIds) :
        Array.isArray(rawToolIds) ? (rawToolIds as string[]) :
        undefined

      // 3. 创建 Agent 并发送消息
      const runner = createMasterAgentRunner({
        model: resolved.model,
        modelInfo: resolved.modelInfo,
        toolIds: toolIds ? (toolIds as readonly string[]) : undefined,
      })

      const agentStream = await runner.agent.stream({
        messages: [{ role: 'user' as const, content: prompt }],
        abortSignal: ac.signal,
      })

      // 4. 消费 UIMessageStream 收集追踪（复用 level3 模式）
      const uiStream = agentStream.toUIMessageStream({ originalMessages: [] })

      let outputText = ''
      const toolCalls: ToolCallRecord[] = []

      const reader = uiStream.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue

        const type = (value as any)?.type
        if (type === 'text-delta') {
          outputText += String((value as any)?.delta ?? (value as any)?.textDelta ?? '')
        } else if (type === 'tool-input-available') {
          toolCalls.push({
            toolCallId: (value as any)?.toolCallId,
            name: (value as any)?.toolName ?? '?',
            input: (value as any)?.input,
            output: undefined,
          })
        } else if (type === 'tool-output-available') {
          const id = (value as any)?.toolCallId
          const match = id
            ? toolCalls.find((t) => t.toolCallId === id)
            : toolCalls[toolCalls.length - 1]
          if (match) match.output = (value as any)?.output
        }
      }

      // 5. 返回 Promptfoo ProviderResponse
      const toolNames = [...new Set(toolCalls.map((t) => t.name))]

      return {
        output: outputText,
        metadata: {
          toolCalls,
          toolNames,
          toolCallCount: toolCalls.length,
        },
        latencyMs: Date.now() - start,
      }
    } catch (err: any) {
      return {
        error: err?.message ?? String(err),
        output: '',
        latencyMs: Date.now() - start,
      }
    }
  }
}
