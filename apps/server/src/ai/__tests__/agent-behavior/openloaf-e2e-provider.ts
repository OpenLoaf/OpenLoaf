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
 * Promptfoo E2E Provider — 直接调用 runChatStream() 走完整 chat pipeline。
 *
 * vs openloaf-agent-provider.ts（旧 Provider）：
 * - 入口：runChatStream() 而非 createMasterAgentRunner()
 * - 工具集：Agent 工厂自动组装（不手动 toolIds）
 * - 模型：从 agent config 自动解析（不手动 setChatModel）
 * - 会话：完整（ensureSession + saveMessage + loadChain）
 * - 多轮：同 sessionId 连续请求，消息自动从 session store 加载
 * - SaaS Token：自动从 ~/.openloaf/auth.json 读取 refresh token 并刷新
 *
 * 运行方式：通过 promptfooconfig.yaml 中 `file://openloaf-e2e-provider.ts` 加载。
 */
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from 'promptfoo'
import { runChatStream } from '@/ai/services/chat/chatStreamService'
import { consumeSseResponse, type SseStreamResult } from '../helpers/sseParser'
import { installHttpProxy } from '@/modules/proxy/httpProxy'
import {
  getAccessToken,
  getRefreshToken,
  applyTokenExchangeResult,
} from '@/modules/auth/tokenStore'
import { refreshAccessToken } from '@/modules/saas/modules/auth'

installHttpProxy()

/**
 * 自动获取 SaaS access token。
 * 优先使用内存中的有效 token，否则用 refresh token 刷新。
 */
async function resolveSaasAccessToken(): Promise<string | undefined> {
  // 1. 内存中已有有效 token
  const cached = getAccessToken()
  if (cached) return cached

  // 2. 从 ~/.openloaf/auth.json 读取 refresh token
  const rt = getRefreshToken()
  if (!rt) return undefined

  // 3. 用 refresh token 换取新 access token
  try {
    const result = await refreshAccessToken(rt)
    if ('message' in result) {
      console.warn(`[e2e] token 刷新失败: ${result.message}`)
      return undefined
    }
    applyTokenExchangeResult({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    })
    return result.accessToken
  } catch (err: any) {
    console.warn(`[e2e] token 刷新异常: ${err?.message}`)
    return undefined
  }
}

export default class OpenLoafE2eProvider implements ApiProvider {
  private saasAccessToken: string | undefined
  private tokenResolved = false

  id() {
    return 'openloaf-e2e'
  }

  /** 懒加载 saas token，整个测试运行期间只刷新一次。 */
  private async ensureSaasToken(): Promise<string | undefined> {
    if (!this.tokenResolved) {
      this.tokenResolved = true
      this.saasAccessToken = await resolveSaasAccessToken()
      if (this.saasAccessToken) {
        console.log('[e2e] SaaS token 已自动加载')
      }
    }
    return this.saasAccessToken
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

    try {
      const saasAccessToken = await this.ensureSaasToken()

      // 多轮对话支持
      const turnsRaw = context?.vars?.turns as string | undefined
      if (turnsRaw) {
        return await this.executeMultiTurn(JSON.parse(turnsRaw), ac, start, saasAccessToken)
      }

      // 单轮请求
      const sessionId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const messageId = crypto.randomUUID()

      const response = await runChatStream({
        request: {
          sessionId,
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
          sessionId, // 同 sessionId → 历史自动从 session store 加载
          messages: [
            {
              id: msgId,
              role: 'user',
              parts: [{ type: 'text', text: turn.text }],
              parentMessageId: null, // 由 saveLastMessageAndResolveParent 自动解析
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
      output: lastParsed!.textOutput, // 最后一轮的输出
      metadata: {
        toolCalls: allToolCalls,
        toolNames: [...new Set(allToolCalls.map((t) => t.toolName))],
        toolCallCount: allToolCalls.length,
        sessionId,
      },
      latencyMs: Date.now() - start,
    }
  }
}
