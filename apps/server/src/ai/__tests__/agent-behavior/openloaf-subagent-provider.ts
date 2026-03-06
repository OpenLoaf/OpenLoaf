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
 * Promptfoo 专项子 Agent Provider — 直接使用指定 agentType 模板的工具集和系统提示词。
 *
 * 与 openloaf-e2e-provider.ts 的区别：
 * - 不走 runChatStream() 完整 chat pipeline
 * - 直接用 createMasterAgentRunner({ toolIds, instructions }) 初始化指定 Agent
 * - 通过 config.agentType 从 agentTemplates 注册表查找模板
 *
 * 适用场景：测试专项 Agent（calendar、email、project 等）的工具选择和参数正确性。
 *
 * promptfooconfig.yaml 中的 Provider 声明示例：
 *   - id: "file://openloaf-subagent-provider.ts"
 *     label: calendar
 *     config:
 *       agentType: calendar
 */
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from 'promptfoo'
import { createSubAgent } from '@/ai/services/agentFactory'
import { getTemplate } from '@/ai/agent-templates'
import {
  resolveTestModel,
  setMinimalRequestContext,
  setChatModel,
  setAbortSignal,
} from '../helpers/testEnv'

type ToolCallRecord = {
  toolCallId?: string
  toolName: string
  args: unknown
  output: unknown
}

export default class OpenLoafSubagentProvider implements ApiProvider {
  private agentType: string

  constructor(options?: { config?: Record<string, unknown> }) {
    this.agentType = (options?.config?.agentType as string) ?? 'master'
  }

  id() {
    return `openloaf-subagent:${this.agentType}`
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const start = Date.now()

    try {
      // 1. 从注册表查找模板
      const template = getTemplate(this.agentType)
      if (!template) {
        return {
          error: `未找到 agentType="${this.agentType}" 的模板，可用: master/calendar/email/project/document/shell/coder/widget/browser`,
          output: '',
          latencyMs: Date.now() - start,
        }
      }

      // 2. 解析模型 + 设置上下文
      const resolved = await resolveTestModel()
      setMinimalRequestContext()
      setChatModel(resolved.model)
      const ac = new AbortController()
      setAbortSignal(ac.signal)

      if (options?.abortSignal) {
        options.abortSignal.addEventListener('abort', () => ac.abort(), { once: true })
      }

      // 3. 创建专项 Agent（使用模板的 toolIds 和 systemPrompt）
      const agent = createSubAgent({
        agentType: 'system',
        model: resolved.model,
        rawAgentType: this.agentType,
        inlineConfig: {
          systemPrompt: template.systemPrompt,
          toolIds: [...template.toolIds],
        },
      })

      const agentStream = await agent.stream({
        messages: [{ role: 'user' as const, content: prompt }],
        abortSignal: ac.signal,
      })

      // 4. 消费 UIMessageStream 收集工具调用追踪
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
            toolName: (value as any)?.toolName ?? '?',
            args: (value as any)?.input,
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
      const toolNames = [...new Set(toolCalls.map((t) => t.toolName))]

      return {
        output: outputText,
        metadata: {
          toolCalls,
          toolNames,
          toolCallCount: toolCalls.length,
          agentType: this.agentType,
          templateId: template.id,
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
