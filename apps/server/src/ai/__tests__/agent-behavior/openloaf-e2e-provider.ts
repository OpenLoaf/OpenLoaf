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
 * - SaaS Token：自动从 auth.json 刷新，或从 env 读取，或自动回退本地模型
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
import { readBasicConf, writeBasicConf } from '@/modules/settings/openloafConfStore'
import { getActiveWorkspaceConfig } from '@openloaf/api/services/workspaceConfig'

installHttpProxy()

// 保证进程退出时恢复 settings.json
let globalRestoreChatSource: (() => void) | undefined
process.on('exit', () => globalRestoreChatSource?.())

/**
 * 自动获取 SaaS access token。
 * 优先级：内存缓存 → env 变量 → refresh token 刷新。
 */
async function resolveSaasAccessToken(): Promise<string | undefined> {
  // 1. 内存中已有有效 token
  const cached = getAccessToken()
  if (cached) return cached

  // 2. 环境变量
  const envToken = process.env.OPENLOAF_SAAS_ACCESS_TOKEN?.trim()
  if (envToken) return envToken

  // 3. 从 ~/.openloaf/auth.json 读取 refresh token 并刷新
  const rt = getRefreshToken()
  if (!rt) return undefined

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

/**
 * 当 chatSource 为 cloud 但无 token 时，临时切换到 local。
 * 返回 restore 函数，用于恢复原始设置。
 */
function ensureLocalModelFallback(saasToken: string | undefined): () => void {
  const conf = readBasicConf()
  if (saasToken || conf.chatSource !== 'cloud') {
    return () => {} // 无需回退
  }

  // 无 token + cloud → 临时切到 local
  console.log('[e2e] 无 SaaS token，自动回退到本地模型 (chatSource: local)')
  writeBasicConf({ ...conf, chatSource: 'local' })
  return () => {
    writeBasicConf({ ...conf, chatSource: 'cloud' })
  }
}

export default class OpenLoafE2eProvider implements ApiProvider {
  private saasAccessToken: string | undefined
  private tokenResolved = false
  private restoreChatSource: (() => void) | undefined
  private workspaceId: string | undefined
  private workspaceResolved = false

  id() {
    return 'openloaf-e2e'
  }

  /** 懒加载 saas token + 模型回退，整个测试运行期间只执行一次。 */
  private async ensureAuth(): Promise<string | undefined> {
    if (!this.tokenResolved) {
      this.tokenResolved = true
      this.saasAccessToken = await resolveSaasAccessToken()
      if (this.saasAccessToken) {
        console.log('[e2e] SaaS token 已自动加载')
      }
      this.restoreChatSource = ensureLocalModelFallback(this.saasAccessToken)
      globalRestoreChatSource = this.restoreChatSource
    }
    return this.saasAccessToken
  }

  /** 懒加载 workspace ID，整个测试运行期间只执行一次。 */
  private ensureWorkspace(): string | undefined {
    if (!this.workspaceResolved) {
      this.workspaceResolved = true
      try {
        const ws = getActiveWorkspaceConfig()
        this.workspaceId = ws.id
        console.log(`[e2e] workspace: ${ws.name} (${ws.id})`)
      } catch (err: any) {
        console.warn(`[e2e] 无法获取活跃 workspace: ${err?.message}`)
      }
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

    try {
      const saasAccessToken = await this.ensureAuth()

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
          workspaceId: this.ensureWorkspace(),
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
