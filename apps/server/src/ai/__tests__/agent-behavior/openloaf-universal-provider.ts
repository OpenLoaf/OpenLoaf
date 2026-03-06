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
 * Promptfoo 通用 Provider — 根据 vars.agentType 路由到不同的 Agent 执行路径。
 *
 * - agentType 未设置 / 'master-e2e'：走完整 runChatStream() E2E pipeline（等同于 openloaf-e2e-provider.ts）
 * - agentType = 'calendar' / 'email' / ... ：从注册表查找模板，用 createMasterAgentRunner() 直接运行
 *
 * 使用方式：在 promptfooconfig.yaml 中设置唯一 provider，测试用例通过 vars.agentType 指定 Agent 类型。
 *
 * 例：
 *   vars:
 *     agentType: calendar
 *     prompt: "今天有什么日程"
 */
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from 'promptfoo'
import { createSubAgent } from '@/ai/services/agentFactory'
import { getTemplate } from '@/ai/agent-templates'
import { runChatStream } from '@/ai/services/chat/chatStreamService'
import { consumeSseResponse, type SseStreamResult } from '../helpers/sseParser'
import { installHttpProxy } from '@/modules/proxy/httpProxy'
import {
  getAccessToken,
  getRefreshToken,
  applyTokenExchangeResult,
} from '@/modules/auth/tokenStore'
import { refreshAccessToken } from '@/modules/saas/modules/auth'
import { readBasicConf, writeBasicConf } from '@/modules/settings/openloafConfStore'
import { getActiveWorkspaceConfig } from '@openloaf/api/services/workspaceConfig'
import {
  resolveTestModel,
  setMinimalRequestContext,
  setChatModel,
  setAbortSignal,
  setupE2eTestEnv,
} from '../helpers/testEnv'

installHttpProxy()

// 初始化 E2E 测试环境（临时目录 + workspace 数据 + root override）
setupE2eTestEnv()

let globalRestoreChatSource: (() => void) | undefined
process.on('exit', () => globalRestoreChatSource?.())

type ToolCallRecord = {
  toolCallId?: string
  toolName: string
  args: unknown
  output: unknown
}

async function resolveSaasAccessToken(): Promise<string | undefined> {
  const cached = getAccessToken()
  if (cached) return cached

  const envToken = process.env.OPENLOAF_SAAS_ACCESS_TOKEN?.trim()
  if (envToken) return envToken

  const rt = getRefreshToken()
  if (!rt) return undefined

  try {
    const result = await refreshAccessToken(rt)
    if ('message' in result) return undefined
    applyTokenExchangeResult({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    })
    return result.accessToken
  } catch {
    return undefined
  }
}

function ensureLocalModelFallback(saasToken: string | undefined): () => void {
  const conf = readBasicConf()
  if (saasToken || conf.chatSource !== 'cloud') return () => {}

  console.log('[universal] 无 SaaS token，自动回退到本地模型')
  writeBasicConf({ ...conf, chatSource: 'local' })
  return () => {
    writeBasicConf({ ...conf, chatSource: 'cloud' })
  }
}

export default class OpenLoafUniversalProvider implements ApiProvider {
  private saasAccessToken: string | undefined
  private tokenResolved = false
  private restoreChatSource: (() => void) | undefined
  private workspaceId: string | undefined
  private workspaceResolved = false

  id() {
    return 'openloaf-universal'
  }

  private async ensureAuth(): Promise<string | undefined> {
    if (!this.tokenResolved) {
      this.tokenResolved = true
      this.saasAccessToken = await resolveSaasAccessToken()
      this.restoreChatSource = ensureLocalModelFallback(this.saasAccessToken)
      globalRestoreChatSource = this.restoreChatSource
    }
    return this.saasAccessToken
  }

  private ensureWorkspace(): string | undefined {
    if (!this.workspaceResolved) {
      this.workspaceResolved = true
      try {
        const ws = getActiveWorkspaceConfig()
        this.workspaceId = ws.id
      } catch {}
    }
    return this.workspaceId
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const start = Date.now()
    const ac = new AbortController()
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => ac.abort(), { once: true })
    }

    const agentType = (context?.vars?.agentType as string | undefined) ?? 'master-e2e'

    try {
      // ─── 路径 A：Master E2E（完整 chat pipeline）───
      if (!agentType || agentType === 'master-e2e') {
        return await this.runE2e(prompt, context, ac, start)
      }

      // ─── 路径 B：专项 Agent（直接使用模板工具集）───
      return await this.runSubagent(agentType, prompt, ac, start, options)
    } catch (err: any) {
      return {
        error: err?.message ?? String(err),
        output: '',
        latencyMs: Date.now() - start,
      }
    }
  }

  private async runE2e(
    prompt: string,
    context: CallApiContextParams | undefined,
    ac: AbortController,
    start: number,
  ): Promise<ProviderResponse> {
    const saasAccessToken = await this.ensureAuth()

    // 多轮对话支持
    const turnsRaw = context?.vars?.turns as string | undefined
    if (turnsRaw) {
      return await this.executeMultiTurn(JSON.parse(turnsRaw), ac, start, saasAccessToken)
    }

    const sessionId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const messageId = crypto.randomUUID()

    const response = await runChatStream({
      request: {
        sessionId,
        workspaceId: this.ensureWorkspace(),
        messages: [
          {
            id: messageId,
            role: 'user',
            parts: [{ type: 'text', text: prompt }],
            parentMessageId: null,
          },
        ],
        intent: 'chat',
        responseMode: 'stream',
        timezone: 'Asia/Shanghai',
      },
      cookies: {},
      requestSignal: ac.signal,
      saasAccessToken,
    })

    const parsed = await consumeSseResponse(response)
    return {
      output: parsed.textOutput,
      metadata: {
        toolCalls: parsed.toolCalls,
        toolNames: parsed.toolNames,
        toolCallCount: parsed.toolCalls.length,
        subAgentEvents: parsed.subAgentEvents,
        hasSubAgentDispatch: parsed.subAgentEvents.some((e) =>
          e.type.includes('sub-agent-start'),
        ),
        finishReason: parsed.finishReason,
        sessionId,
        agentType: 'master-e2e',
      },
      latencyMs: Date.now() - start,
    }
  }

  private async runSubagent(
    agentType: string,
    prompt: string,
    ac: AbortController,
    start: number,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const template = getTemplate(agentType)
    if (!template) {
      return {
        error: `未找到 agentType="${agentType}" 的模板，可用: master/calendar/email/project/document/shell/coder/widget/browser`,
        output: '',
        latencyMs: Date.now() - start,
      }
    }

    const resolved = await resolveTestModel()
    setMinimalRequestContext()
    setChatModel(resolved.model)
    setAbortSignal(ac.signal)

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => ac.abort(), { once: true })
    }

    const agent = createSubAgent({
      agentType: 'system',
      model: resolved.model,
      rawAgentType: agentType,
      inlineConfig: {
        systemPrompt: template.systemPrompt,
        toolIds: [...template.toolIds],
      },
    })

    const agentStream = await agent.stream({
      messages: [{ role: 'user' as const, content: prompt }],
      abortSignal: ac.signal,
    })

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

    const toolNames = [...new Set(toolCalls.map((t) => t.toolName))]

    return {
      output: outputText,
      metadata: {
        toolCalls,
        toolNames,
        toolCallCount: toolCalls.length,
        agentType,
        templateId: template.id,
      },
      latencyMs: Date.now() - start,
    }
  }

  private async executeMultiTurn(
    turns: Array<{ text: string }>,
    ac: AbortController,
    start: number,
    saasAccessToken?: string,
  ): Promise<ProviderResponse> {
    const sessionId = `e2e-mt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let lastParsed: SseStreamResult | undefined
    const allToolCalls: SseStreamResult['toolCalls'] = []

    for (const turn of turns) {
      const msgId = crypto.randomUUID()
      const response = await runChatStream({
        request: {
          sessionId,
          workspaceId: this.ensureWorkspace(),
          messages: [
            {
              id: msgId,
              role: 'user',
              parts: [{ type: 'text', text: turn.text }],
              parentMessageId: null,
            },
          ],
          intent: 'chat',
          responseMode: 'stream',
          timezone: 'Asia/Shanghai',
        },
        cookies: {},
        requestSignal: ac.signal,
        saasAccessToken,
      })
      lastParsed = await consumeSseResponse(response)
      allToolCalls.push(...lastParsed.toolCalls)
    }

    return {
      output: lastParsed!.textOutput,
      metadata: {
        toolCalls: allToolCalls,
        toolNames: [...new Set(allToolCalls.map((t) => t.toolName))],
        toolCallCount: allToolCalls.length,
        sessionId,
        agentType: 'master-e2e',
      },
      latencyMs: Date.now() - start,
    }
  }
}
