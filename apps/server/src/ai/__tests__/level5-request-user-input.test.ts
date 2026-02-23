/**
 * Level 5 — 测试 request-user-input 工具的审批流程。
 *
 * 问题复现：
 * 1. AI 调用 request-user-input 工具
 * 2. 流以 finishReason: "tool-calls" 结束
 * 3. Assistant 消息应该被保存（包含工具调用 part）
 * 4. 用户提交后，续接请求应该携带 toolApprovalPayloads
 * 5. 工具 execute 函数应该获取用户输入
 *
 * 用法：
 *   TENAS_TEST_CHAT_MODEL_ID="profileId:modelId" pnpm run test:ai:request-user-input
 */
import {
  resolveTestModel,
  setMinimalRequestContext,
  setChatModel,
  setAbortSignal,
} from './helpers/testEnv'
import { createMasterAgentRunner } from '@/ai/services/masterAgentRunner'
import {
  printSection,
  printModelInfo,
  printPass,
  printFail,
  printDuration,
} from './helpers/printUtils'
import { generateId, type UIMessage } from 'ai'
import { setRequestContext } from '@/ai/shared/context/requestContext'
import { buildModelChain } from '@/ai/services/chat/chatStreamHelpers'
import { buildModelMessages } from '@/ai/shared/messageConverter'

const TEST_PROMPT = '请使用 request-user-input 工具收集我的个人信息（姓名和邮箱）'

async function main() {
  const start = Date.now()
  let passed = 0
  let failed = 0

  // ── 解析模型 ──
  printSection('Resolve model')
  const resolved = await resolveTestModel()
  printModelInfo({
    provider: resolved.modelInfo.provider,
    modelId: resolved.modelInfo.modelId,
    chatModelId: resolved.chatModelId,
  })

  // ── 检查 request-user-input 工具是否可用 ──
  printSection('Check request-user-input tool')
  const runner0 = createMasterAgentRunner({
    model: resolved.model,
    modelInfo: resolved.modelInfo,
  })
  const tools = runner0.agent.tools ?? {}
  const hasRequestUserInput = 'request-user-input' in tools || Object.keys(tools).some((k) => k.includes('request-user-input') || k.includes('requestUserInput'))
  console.log(`  available tools: ${Object.keys(tools).join(', ')}`)
  console.log(`  has request-user-input: ${hasRequestUserInput}`)

  // ── 设置上下文 ──
  const sessionId = `test-${Date.now()}`
  setMinimalRequestContext()
  setChatModel(resolved.model)
  const ac = new AbortController()
  setAbortSignal(ac.signal)

  // ── Test 1: 第一次请求，AI 调用 request-user-input 工具（需要 LLM，可选） ──
  printSection('Test 1: First request — verify onFinish responseMessage (optional, needs LLM)')
  console.log(`  prompt: "${TEST_PROMPT}"`)
  console.log('  [info] 此测试需要 LLM 正确响应，失败不影响核心逻辑验证')

  let toolCallId = ''
  let toolArgs: any = null
  let onFinishResponseMessage: any = null
  let onFinishReason = ''
  let onFinishIsAborted = false

  try {
    const callStart = Date.now()
    const runner = createMasterAgentRunner({
      model: resolved.model,
      modelInfo: resolved.modelInfo,
    })

    const agentStream = await runner.agent.stream({
      messages: [{ role: 'user' as const, content: TEST_PROMPT }],
      abortSignal: ac.signal,
    })

    // 关键：添加 onFinish 回调来捕获 responseMessage
    const uiStream = agentStream.toUIMessageStream({
      originalMessages: [],
      generateMessageId: () => generateId(),
      onFinish: async ({ responseMessage, finishReason, isAborted }) => {
        onFinishResponseMessage = responseMessage
        onFinishReason = finishReason ?? ''
        onFinishIsAborted = isAborted ?? false
      },
    })

    let hasToolCall = false
    let hasInputStart = false
    const chunks: any[] = []

    const reader = uiStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      const type = (value as any)?.type
      console.log(`  [event] ${type}`)

      if (type === 'tool-input-start') {
        hasInputStart = true
        toolCallId = (value as any)?.toolCallId ?? ''
        const toolName = (value as any)?.toolName ?? '?'
        console.log(`  [tool-input-start] toolName=${toolName}, toolCallId=${toolCallId}`)
      } else if (type === 'tool-input-available') {
        hasToolCall = true
        const toolName = (value as any)?.toolName ?? '?'
        toolArgs = (value as any)?.input
        console.log(`  [tool-input-available] toolName=${toolName}`)
        console.log(`    input: ${JSON.stringify(toolArgs)?.slice(0, 200)}`)
      } else if (type === 'finish') {
        console.log(`  [finish] finishReason=${(value as any)?.finishReason}`)
      }
    }

    // 等待 onFinish 完成
    await new Promise((r) => setTimeout(r, 500))

    printDuration(callStart)
    console.log(`  chunks: ${chunks.length}`)
    console.log(`  has tool-input-start: ${hasInputStart}`)
    console.log(`  has tool-input-available: ${hasToolCall}`)

    // 验证 onFinish 数据
    console.log(`\n  === onFinish 数据 ===`)
    console.log(`  finishReason: ${onFinishReason}`)
    console.log(`  isAborted: ${onFinishIsAborted}`)
    console.log(`  responseMessage exists: ${!!onFinishResponseMessage}`)
    if (onFinishResponseMessage) {
      console.log(`  responseMessage.role: ${onFinishResponseMessage.role}`)
      const parts = onFinishResponseMessage.parts ?? []
      console.log(`  responseMessage.parts.length: ${parts.length}`)
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        console.log(`  part[${i}]: type=${p?.type}, state=${p?.state}, toolName=${p?.toolName ?? '-'}`)
        if (p?.type === 'tool-invocation') {
          console.log(`    toolCallId=${p.toolCallId}`)
          console.log(`    args=${JSON.stringify(p.args)?.slice(0, 200)}`)
        }
      }
    }

    // 断言
    if (!hasInputStart && !hasToolCall) {
      throw new Error('AI 没有调用 request-user-input 工具')
    }
    if (!toolCallId) {
      throw new Error('没有获取到 toolCallId')
    }
    if (!onFinishResponseMessage) {
      throw new Error('onFinish 没有收到 responseMessage')
    }
    const responseParts = onFinishResponseMessage?.parts ?? []
    if (responseParts.length === 0) {
      throw new Error('onFinish responseMessage.parts 为空 — 这就是消息未保存的原因！')
    }
    // 接受 tool-invocation 或 tool-{toolName} 类型的 part
    const toolPart = responseParts.find((p: any) =>
      p?.type === 'tool-invocation' ||
      (typeof p?.type === 'string' && p.type.startsWith('tool-') && p.state)
    )
    if (!toolPart) {
      throw new Error('responseMessage.parts 中没有 tool part')
    }

    printPass('First request — onFinish has tool parts')
    passed++
  } catch (err) {
    console.log(`  WARN  First request (LLM-dependent, non-critical): ${(err as Error)?.message}`)
    // 不计入 failed，因为这是 LLM 依赖的测试
  }

  // ── Test 2: 验证 buildModelChain 对 approval-requested 的处理（合成数据） ──
  printSection('Test 2: buildModelChain with/without approval payloads (synthetic)')

  const syntheticToolCallId = `call_synthetic_${Date.now()}`
  try {
    // 模拟 AI SDK 产生的 approval-requested part 格式
    const syntheticAssistant: UIMessage = {
      id: 'msg-assistant-synthetic',
      role: 'assistant',
      parts: [
        { type: 'text', text: '我来收集您的信息。' },
        {
          type: 'tool-request-user-input',
          toolCallId: syntheticToolCallId,
          toolName: 'request-user-input',
          state: 'approval-requested',
          input: {
            title: '个人信息',
            fields: [
              { name: 'name', label: '姓名', type: 'text' },
              { name: 'email', label: '邮箱', type: 'text' },
            ],
          },
        } as any,
      ],
    }

    const fakeMessages: UIMessage[] = [
      { id: 'msg-user', role: 'user', parts: [{ type: 'text', text: TEST_PROMPT }] },
      syntheticAssistant,
    ]

    // 2a: 不带 approval payloads 时 — approval-requested 应被移除
    setRequestContext({ sessionId: `${sessionId}-test2a`, cookies: {} })
    const chainWithout = buildModelChain(fakeMessages)
    console.log(`  === 无 approvalPayloads ===`)
    console.log(`  原始消息数: ${fakeMessages.length}`)
    console.log(`  buildModelChain 后消息数: ${chainWithout.length}`)
    const assistantWithout = chainWithout.find((m) => m.role === 'assistant')
    if (!assistantWithout) {
      console.log('  [确认] assistant 消息被移除（approval-requested part 被 strip，仅剩 text 被保留）')
    } else {
      const parts = (assistantWithout as any).parts ?? []
      console.log(`  assistant parts: ${parts.length}`)
      for (const p of parts) {
        console.log(`    type=${p?.type}, state=${(p as any)?.state}`)
      }
      // 确认 approval-requested part 被移除
      const hasApproval = parts.some((p: any) => p?.state === 'approval-requested')
      if (hasApproval) throw new Error('approval-requested part 应该被移除')
    }

    // 2b: 带 approval payloads 时 — 应转换为 output-available
    const approvalPayloads = {
      [syntheticToolCallId]: {
        answers: { name: '测试用户', email: 'test@example.com' },
      },
    }
    setRequestContext({
      sessionId: `${sessionId}-test2b`,
      cookies: {},
      toolApprovalPayloads: approvalPayloads,
    })
    const chainWith = buildModelChain(fakeMessages)
    console.log(`\n  === 有 approvalPayloads ===`)
    console.log(`  buildModelChain 后消息数: ${chainWith.length}`)
    const assistantWith = chainWith.find((m) => m.role === 'assistant')
    if (!assistantWith) {
      throw new Error('带 approvalPayloads 时 assistant 消息不应被移除')
    }
    const convertedParts = (assistantWith as any).parts ?? []
    console.log(`  assistant parts: ${convertedParts.length}`)
    for (const p of convertedParts) {
      console.log(`    type=${p?.type}, state=${(p as any)?.state}`)
      if ((p as any)?.state === 'output-available') {
        console.log(`    output=${JSON.stringify((p as any).output)?.slice(0, 200)}`)
      }
    }

    const resultPart = convertedParts.find(
      (p: any) => p?.state === 'output-available' && p?.output
    )
    if (!resultPart) {
      throw new Error('approval-requested part 没有被转换为 output-available')
    }

    printPass('buildModelChain correctly handles approval payloads')
    passed++
  } catch (err) {
    printFail('buildModelChain test', err)
    failed++
  }

  // ── Test 3: buildModelMessages 转换不报 MissingToolResultsError ──
  printSection('Test 3: buildModelMessages conversion (no MissingToolResultsError)')

  try {
    const approvalPayloads = {
      [syntheticToolCallId]: {
        answers: { name: '测试用户', email: 'test@example.com' },
      },
    }

    // 设置带 toolApprovalPayloads 的 RequestContext
    setRequestContext({
      sessionId: `${sessionId}-test3`,
      cookies: {},
      toolApprovalPayloads: approvalPayloads,
    })

    const syntheticAssistant: UIMessage = {
      id: 'msg-assistant-synthetic-3',
      role: 'assistant',
      parts: [
        { type: 'text', text: '我来收集您的信息。' },
        {
          type: 'tool-request-user-input',
          toolCallId: syntheticToolCallId,
          toolName: 'request-user-input',
          state: 'approval-requested',
          input: {
            title: '个人信息',
            fields: [
              { name: 'name', label: '姓名', type: 'text' },
              { name: 'email', label: '邮箱', type: 'text' },
            ],
          },
        } as any,
      ],
    }

    const rawMessages: UIMessage[] = [
      { id: 'msg-user', role: 'user', parts: [{ type: 'text', text: TEST_PROMPT }] },
      syntheticAssistant,
    ]

    // buildModelChain 转换 approval-requested → output-available
    const convertedMessages = buildModelChain(rawMessages)
    console.log(`  convertedMessages count: ${convertedMessages.length}`)
    for (const msg of convertedMessages) {
      const parts = (msg as any).parts ?? []
      console.log(`  [${msg.role}] parts=${parts.length}`)
      for (const p of parts) {
        console.log(`    type=${p?.type}, state=${(p as any)?.state}`)
      }
    }

    // 关键：buildModelMessages 不应抛出 MissingToolResultsError
    const runner = createMasterAgentRunner({
      model: resolved.model,
      modelInfo: resolved.modelInfo,
    })
    const modelMessages = await buildModelMessages(
      convertedMessages,
      runner.agent.tools,
    )

    console.log(`  modelMessages count: ${modelMessages.length}`)
    for (const msg of modelMessages) {
      const role = (msg as any).role
      const content = (msg as any).content
      if (Array.isArray(content)) {
        console.log(`  [${role}] content items: ${content.length}`)
        for (const c of content) {
          console.log(`    type=${c?.type}, toolCallId=${c?.toolCallId ?? '-'}`)
        }
      } else {
        console.log(`  [${role}] content: ${String(content)?.slice(0, 100)}`)
      }
    }

    // 验证：应有 assistant 消息（含 tool-call）和 tool 消息（含 tool-result）
    const hasAssistantToolCall = modelMessages.some((m: any) =>
      m.role === 'assistant' && Array.isArray(m.content) &&
      m.content.some((c: any) => c.type === 'tool-call')
    )
    const hasToolResult = modelMessages.some((m: any) =>
      m.role === 'tool' && Array.isArray(m.content) &&
      m.content.some((c: any) => c.type === 'tool-result')
    )

    console.log(`  has assistant tool-call: ${hasAssistantToolCall}`)
    console.log(`  has tool result message: ${hasToolResult}`)

    if (!hasAssistantToolCall) {
      throw new Error('modelMessages 中缺少 assistant tool-call')
    }
    if (!hasToolResult) {
      throw new Error('modelMessages 中缺少 tool result — 这会导致 MissingToolResultsError')
    }

    printPass('buildModelMessages conversion — no MissingToolResultsError')
    passed++
  } catch (err) {
    printFail('buildModelMessages conversion', err)
    failed++
  }

  // ── 汇总 ──
  printSection('Summary')
  printDuration(start)
  console.log(`  ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
