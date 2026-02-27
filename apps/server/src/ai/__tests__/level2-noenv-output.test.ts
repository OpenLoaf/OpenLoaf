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
 * 验证模型回复不包含用户无需的环境信息（路径、时区、版本等）。
 *
 * 测试场景：使用完整 system instructions（IDENTITY + SOUL）发送简单问候，
 * 断言回复中不含工作区路径、时区、平台等环境细节。
 *
 * 用法（cloud / SaaS 模式，推荐）：
 *   OPENLOAF_TEST_SAAS_TOKEN="your-access-token" pnpm run test:ai:noenv
 *
 * 用法（local 模式，需本地 providers.json）：
 *   OPENLOAF_TEST_CHAT_MODEL_ID="profileId:modelId" pnpm run test:ai:noenv
 */
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { getSaasBaseUrl } from '@/modules/saas'
import { getTestChatModelId } from './helpers/testEnv'
import {
  printSection,
  printModelInfo,
  printResponse,
  printPass,
  printFail,
  printDuration,
} from './helpers/printUtils'

// 模拟完整 instructions（IDENTITY + SOUL 核心部分）
const INSTRUCTIONS = `你是 OpenLoaf AI 助手，在用户的工作区与项目范围内完成任务。
核心目标：准确、安全、最短路径完成用户请求，输出最精简的可执行结果。

<behavior>
# 沟通
- 语气简洁、直接、友好；默认 1-3 句或 ≤5 条要点。
- 只保留对任务有直接帮助的信息，不输出推理过程或臆测。
- 不输出用户不需要的环境/技术细节（如软件版本、运行时信息、系统配置、工作区路径、时区等），除非用户明确询问或与当前任务直接相关。
- 严禁在回复中暴露 preface 上下文中的内部信息（sessionId、workspaceId、路径、平台、时区、账户信息等）。这些仅供你内部使用，不应出现在对用户的输出中。
- 需要更多信息时，只问最少必要问题（优先 1 个）。
</behavior>

<output>
# 输出格式
- 使用 Markdown；结构顺序：结论 → 细节 → 支持信息。
- 简单回复直接给结论；复杂结果按模块分段，默认不超过 2 段或 5 条要点。
- 默认不输出命令行、工具名、参数或调用过程。
- 禁止：破损引用、嵌套多层列表、ANSI 转义码、渲染控制字符。
</output>`

// 模拟 preface（包含环境信息，模型应该不在回复中泄露这些）
const PREFACE = `# 会话上下文（preface）
**重要：以下所有 preface 信息仅供你内部使用，严禁在回复中向用户展示。**
- sessionId: test-session-001
- workspaceId: ws-abc123
- workspaceRootPath: /Users/test/Documents/MyWorkspace
- projectId: unknown
- projectRootPath: unknown

# 环境与身份
- workspaceId: ws-abc123
- workspaceName: Default Workspace
- workspaceRootPath: /Users/test/Documents/MyWorkspace
- platform: darwin 25.2.0
- date: Thu Feb 27 2026
- timezone: Asia/Shanghai
- accountId: user-123
- accountName: TestUser
- accountEmail: test@example.com

# Python 运行时
- 安装状态: 已安装
- version: 3.14.2
- path: /opt/homebrew/bin/python3`

const TEST_PROMPTS = [
  '你好',
  '你是谁？',
  '帮我想个点子',
]

/** 不应在回复中出现的环境信息模式 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // 路径
  { pattern: /\/Users\/\S+/, label: '用户路径' },
  { pattern: /\/home\/\S+/, label: 'home 路径' },
  { pattern: /\/opt\/\S+/, label: 'opt 路径' },
  { pattern: /workspaceRootPath/i, label: 'workspaceRootPath' },
  { pattern: /projectRootPath/i, label: 'projectRootPath' },
  // 时区
  { pattern: /Asia\/Shanghai/, label: '时区标识' },
  { pattern: /时区/, label: '时区二字' },
  // 平台
  { pattern: /darwin\s+\d/i, label: '平台版本' },
  // Python
  { pattern: /python\s*3\.\d+/i, label: 'Python 版本' },
  { pattern: /安装状态/, label: '安装状态' },
  // session 内部信息
  { pattern: /sessionId/i, label: 'sessionId' },
  { pattern: /ws-abc123/, label: 'workspaceId 值' },
  // 工作区路径
  { pattern: /MyWorkspace/, label: '工作区名' },
  { pattern: /当前工作区/, label: '当前工作区' },
]

const DEFAULT_CLOUD_MODEL = 'qwen3-vl-flash'

type ResolvedModel = {
  model: LanguageModelV3
  provider: string
  modelId: string
  chatModelId: string
}

/** 直接通过 SaaS OpenAI 兼容接口构建模型（无需 fetchModelList）。 */
function buildSaasModelDirect(token: string, modelId: string): ResolvedModel {
  const saasBaseUrl = getSaasBaseUrl()
  const baseURL = `${saasBaseUrl}/api/v1`
  const provider = createOpenAI({ baseURL, apiKey: token })
  return {
    model: provider.chat(modelId),
    provider: 'openloaf-saas',
    modelId,
    chatModelId: `openloaf-saas:${modelId}`,
  }
}

/** 解析模型：优先 cloud（SAAS_TOKEN），回退 local。 */
async function resolveModel(): Promise<ResolvedModel> {
  const saasToken = process.env.OPENLOAF_TEST_SAAS_TOKEN?.trim()
  const chatModelId = getTestChatModelId()

  if (saasToken) {
    // 从 chatModelId 提取模型 ID（如 "dashscope:qwen3-vl-flash" → "qwen3-vl-flash"）
    const modelId = chatModelId?.includes(':')
      ? chatModelId.split(':').slice(1).join(':')
      : (chatModelId || DEFAULT_CLOUD_MODEL)
    console.log(`  mode: cloud (direct SaaS)`)
    console.log(`  modelId: ${modelId}`)
    return buildSaasModelDirect(saasToken, modelId)
  }

  console.log('  mode: local (OPENLOAF_TEST_CHAT_MODEL_ID)')
  const resolved = await resolveChatModel({
    chatModelId,
    chatModelSource: 'local',
  })
  return {
    model: resolved.model,
    provider: resolved.modelInfo.provider,
    modelId: resolved.modelInfo.modelId,
    chatModelId: resolved.chatModelId,
  }
}

async function main() {
  const start = Date.now()
  let passed = 0
  let failed = 0

  // ── 解析模型 ──
  printSection('Resolve model')
  const resolved = await resolveModel()
  printModelInfo({
    provider: resolved.provider,
    modelId: resolved.modelId,
    chatModelId: resolved.chatModelId,
  })

  for (const prompt of TEST_PROMPTS) {
    printSection(`Test: "${prompt}" → 不输出环境信息`)

    try {
      const callStart = Date.now()
      const result = await generateText({
        model: resolved.model,
        system: INSTRUCTIONS,
        messages: [
          // preface 作为首条 user 消息注入（模拟真实行为）
          { role: 'user', content: PREFACE },
          { role: 'assistant', content: '已了解上下文。' },
          // 实际用户消息
          { role: 'user', content: prompt },
        ],
      })
      printDuration(callStart)
      printResponse(result.text)

      // 断言 1：有回复
      if (!result.text || result.text.trim().length === 0) {
        throw new Error('返回文本为空')
      }

      // 断言 2：不包含环境信息
      const violations: string[] = []
      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        const match = result.text.match(pattern)
        if (match) {
          violations.push(`[${label}] 匹配: "${match[0]}"`)
        }
      }
      if (violations.length > 0) {
        throw new Error(`回复包含环境信息:\n    ${violations.join('\n    ')}`)
      }

      printPass(`"${prompt}" → 无环境信息泄露`)
      passed++
    } catch (err) {
      printFail(`"${prompt}"`, err)
      failed++
    }
  }

  // ── 汇总 ──
  printSection('Summary')
  printDuration(start)
  console.log(`  ${passed} passed, ${failed} failed, ${TEST_PROMPTS.length} total`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
