/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * Message list pure-logic tests.
 *
 * 测试前端消息列表中的纯逻辑函数（不依赖 React）：
 * - normalizeParts (server 端落盘过滤)
 * - messageHasVisibleContent (前端可见性判断)
 * - displayMessages 计算逻辑
 * - branch-utils (分支操作工具)
 * - preprocessChatText (文本预处理)
 * - isToolPart / isHiddenToolPart (工具识别)
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/messageList-logic.test.ts
 */
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Reimplemented pure functions from frontend (no React dependency)
// ---------------------------------------------------------------------------

// From: apps/server/src/ai/services/chat/repositories/messageStore.ts:262-290
function normalizeParts(parts: unknown): unknown[] {
  const arr = Array.isArray(parts) ? parts : []
  return arr
    .filter((part) => {
      if (!part || typeof part !== 'object') return true
      const record = part as any
      if (record.type === 'step-start') return false
      if (record.state === 'streaming') return false
      if (record.type === 'data-step-thinking') return false
      if (record.type === 'text' && record.text === '') return false
      if (record.state === 'input-streaming' && record.input == null) return false
      if (record.type === 'data-sub-agent-chunk') return false
      if (record.type === 'data-sub-agent-delta') return false
      return true
    })
    .map((part) => {
      if (!part || typeof part !== 'object') return part
      const record = part as any
      if (record.state === 'input-streaming' && record.input != null) {
        return { ...record, state: 'input-available' }
      }
      return part
    })
}

// From: apps/web/src/lib/chat/message-parts.ts
const HIDDEN_TOOL_NAMES = new Set(['ToolSearch'])

function resolveToolName(part: { type?: unknown; toolName?: unknown }): string {
  if (typeof part.toolName === 'string' && part.toolName.trim()) return part.toolName.trim()
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    return part.type.slice('tool-'.length).trim()
  }
  return ''
}

function isToolPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false
  const p = part as any
  if (resolveToolName(p)) return true
  if (typeof p.type !== 'string') return false
  return p.type.trim() === 'dynamic-tool'
}

function isToolPartError(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false
  const p = part as any
  if (p.state === 'output-error') return true
  if (typeof p.errorText === 'string' && p.errorText.trim().length > 0) return true
  return false
}

function isHiddenToolPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false
  const toolName = resolveToolName(part as any).toLowerCase()
  if (!toolName) return false
  return HIDDEN_TOOL_NAMES.has(toolName)
}

// From: apps/web/src/lib/chat/message-visible.ts
function messageHasVisibleContent(
  message: { parts?: unknown[]; metadata?: unknown } | undefined,
): boolean {
  const parts = Array.isArray(message?.parts) ? message!.parts! : []
  const hasText = parts.some((part: any) =>
    part?.type === 'text' && typeof part?.text === 'string' && part.text.trim().length > 0
  )
  if (hasText) return true
  const hasFile = parts.some((part: any) =>
    part?.type === 'file' && typeof part?.url === 'string'
  )
  if (hasFile) return true
  return parts.some((part: any) => isToolPart(part) && !isHiddenToolPart(part))
}

// From: apps/web/src/lib/chat/message-text.ts (simplified)
function getMessagePlainText(message: { parts?: unknown[] } | undefined): string {
  const parts = Array.isArray(message?.parts) ? (message!.parts as any[]) : []
  return parts
    .filter((part) => part?.type === 'text' && typeof part?.text === 'string')
    .map((part) => String(part.text))
    .join('\n')
    .trim()
}

// From: apps/web/src/components/ai/message/text-tokenizer.ts
function preprocessChatText(value: string): string {
  if (!value) return value
  let cleaned = value.replace(/<think>[\s\S]*?<\/think>/gi, '')
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '')
  cleaned = cleaned.replace(
    /(https?:\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)([\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef])/g,
    '$1 $2',
  )
  return cleaned
}

// From: apps/web/src/components/ai/message/MessageList.tsx displayMessages logic
type SimpleMessage = { id: string; role: string; parts: unknown[]; metadata?: unknown }

function computeDisplayMessages(input: {
  staticMessages: SimpleMessage[]
  streamingMessage: SimpleMessage | null
  shouldShowThinking: boolean
  hasStreamingVisibleContent: boolean
  error: Error | string | null
}): SimpleMessage[] {
  const { staticMessages, streamingMessage, shouldShowThinking, hasStreamingVisibleContent, error } = input
  const base =
    streamingMessage && (!shouldShowThinking || hasStreamingVisibleContent)
      ? [...staticMessages, streamingMessage]
      : staticMessages
  if (error && base.length > 0) {
    const last = base[base.length - 1]
    if (last?.role === 'assistant') {
      if (!messageHasVisibleContent(last)) {
        return base.slice(0, -1)
      }
      const errorMsg = error instanceof Error ? error.message : String(error)
      const lastText = getMessagePlainText(last).trim()
      if (lastText && errorMsg && lastText === errorMsg.trim()) {
        return base.slice(0, -1)
      }
    }
  }
  return base
}

// From: apps/web/src/lib/chat/branch-utils.ts
function resolveParentMessageId(input: {
  explicitParentMessageId: string | null | undefined
  leafMessageId: string | null
  messages: Array<{ id: string }>
}): string | null {
  const { explicitParentMessageId, leafMessageId, messages } = input
  if (explicitParentMessageId !== undefined) return explicitParentMessageId
  if (messages.length === 0) return null
  const lastMessageId = String(messages.at(-1)?.id ?? '') || null
  const isLeafInCurrentMessages =
    typeof leafMessageId === 'string' &&
    leafMessageId.length > 0 &&
    messages.some((m) => String(m.id) === leafMessageId)
  return (isLeafInCurrentMessages ? leafMessageId : null) ?? lastMessageId
}

function findParentUserForRetry(input: {
  assistantMessageId: string
  assistantParentMessageId?: string | null
  siblingNavParentMessageId?: string | null
  messages: Array<{ id: string; role: string }>
}): string | null {
  const { assistantMessageId, assistantParentMessageId, siblingNavParentMessageId, messages } = input
  if (typeof assistantParentMessageId === 'string') return assistantParentMessageId
  if (typeof siblingNavParentMessageId === 'string') return siblingNavParentMessageId
  const idx = messages.findIndex((m) => String(m.id) === assistantMessageId)
  if (idx < 0) return null
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return String(messages[i]!.id)
  }
  return null
}

function sliceMessagesToParent(
  messages: Array<{ id: string }>,
  parentMessageId: string | null,
): Array<{ id: string }> {
  if (parentMessageId === null) return []
  const idx = messages.findIndex((m) => String(m.id) === parentMessageId)
  if (idx < 0) return []
  return messages.slice(0, idx + 1)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  // =======================================================================
  // 1. normalizeParts — 落盘过滤
  // =======================================================================
  console.log('\n--- 1. normalizeParts 落盘过滤 ---')

  await test('NP1: 过滤 step-start', () => {
    const result = normalizeParts([
      { type: 'step-start' },
      { type: 'text', text: 'hello' },
    ])
    assert.equal(result.length, 1)
    assert.equal((result[0] as any).text, 'hello')
  })

  await test('NP2: 过滤 streaming 状态', () => {
    const result = normalizeParts([
      { type: 'tool-invoke', state: 'streaming', toolName: 'test' },
      { type: 'text', text: 'ok' },
    ])
    assert.equal(result.length, 1)
  })

  await test('NP3: 过滤空文本', () => {
    const result = normalizeParts([
      { type: 'text', text: '' },
      { type: 'text', text: 'real' },
    ])
    assert.equal(result.length, 1)
    assert.equal((result[0] as any).text, 'real')
  })

  await test('NP4: 保留有内容的文本（包括空格）', () => {
    const result = normalizeParts([{ type: 'text', text: ' ' }])
    assert.equal(result.length, 1, '仅空格的文本不应被过滤')
  })

  await test('NP5: 过滤 SubAgent 中间产物', () => {
    const result = normalizeParts([
      { type: 'data-sub-agent-chunk', data: {} },
      { type: 'data-sub-agent-delta', delta: 'x' },
      { type: 'text', text: 'keep' },
    ])
    assert.equal(result.length, 1)
  })

  await test('NP6: input-streaming 有 input 提升为 input-available', () => {
    const result = normalizeParts([
      { type: 'tool-invoke', state: 'input-streaming', input: { query: 'test' } },
    ])
    assert.equal(result.length, 1)
    assert.equal((result[0] as any).state, 'input-available')
  })

  await test('NP7: input-streaming 无 input 被过滤', () => {
    const result = normalizeParts([
      { type: 'tool-invoke', state: 'input-streaming', input: null },
    ])
    assert.equal(result.length, 0)
  })

  await test('NP8: 非对象的原始值被保留', () => {
    const result = normalizeParts([42, 'string', null, { type: 'text', text: 'ok' }])
    // null 被 filter 的 !part 过滤掉? No — filter checks !part || typeof part !== 'object'
    // null: !null = true → return true (保留)
    // 42: typeof 42 !== 'object' → return true (保留)
    // 'string': typeof 'string' !== 'object' → return true (保留)
    assert.equal(result.length, 4, '原始值和 null 都被保留')
  })

  await test('NP9: 非数组输入返回空数组', () => {
    assert.deepEqual(normalizeParts(undefined), [])
    assert.deepEqual(normalizeParts(null), [])
    assert.deepEqual(normalizeParts('string'), [])
    assert.deepEqual(normalizeParts(42), [])
  })

  await test('NP10: data-step-thinking 被过滤', () => {
    const result = normalizeParts([
      { type: 'data-step-thinking', text: 'thinking...' },
      { type: 'text', text: 'answer' },
    ])
    assert.equal(result.length, 1)
    assert.equal((result[0] as any).text, 'answer')
  })

  // =======================================================================
  // 2. isToolPart / isHiddenToolPart
  // =======================================================================
  console.log('\n--- 2. isToolPart / isHiddenToolPart ---')

  await test('TP1: toolName 字符串 → true', () => {
    assert.equal(isToolPart({ toolName: 'web-search' }), true)
  })

  await test('TP2: type=tool-xxx → true', () => {
    assert.equal(isToolPart({ type: 'tool-invoke' }), true)
    assert.equal(isToolPart({ type: 'tool-result' }), true)
  })

  await test('TP3: type=dynamic-tool → true', () => {
    assert.equal(isToolPart({ type: 'dynamic-tool' }), true)
  })

  await test('TP4: type=text → false', () => {
    assert.equal(isToolPart({ type: 'text', text: 'hello' }), false)
  })

  await test('TP5: null/undefined → false', () => {
    assert.equal(isToolPart(null), false)
    assert.equal(isToolPart(undefined), false)
    assert.equal(isToolPart('string'), false)
  })

  await test('TP6: ToolSearch 是隐藏工具', () => {
    assert.equal(isHiddenToolPart({ toolName: 'ToolSearch' }), true)
    assert.equal(isHiddenToolPart({ toolName: 'Tool-Search' }), true)
  })

  await test('TP7: web-search 不是隐藏工具', () => {
    assert.equal(isHiddenToolPart({ toolName: 'web-search' }), false)
  })

  await test('TP8: 错误状态的 tool part', () => {
    assert.equal(isToolPartError({ state: 'output-error' }), true)
    assert.equal(isToolPartError({ errorText: 'failed' }), true)
    assert.equal(isToolPartError({ state: 'output-available' }), false)
    assert.equal(isToolPartError({ errorText: '' }), false)
    assert.equal(isToolPartError({ errorText: '  ' }), false)
  })

  // =======================================================================
  // 3. messageHasVisibleContent
  // =======================================================================
  console.log('\n--- 3. messageHasVisibleContent ---')

  await test('VC1: 有文本 → true', () => {
    assert.equal(messageHasVisibleContent({ parts: [{ type: 'text', text: 'hello' }] }), true)
  })

  await test('VC2: 空文本 → false', () => {
    assert.equal(messageHasVisibleContent({ parts: [{ type: 'text', text: '' }] }), false)
    assert.equal(messageHasVisibleContent({ parts: [{ type: 'text', text: '   ' }] }), false)
  })

  await test('VC3: 有文件 → true', () => {
    assert.equal(messageHasVisibleContent({ parts: [{ type: 'file', url: 'http://x' }] }), true)
  })

  await test('VC4: 无 url 的文件 → false', () => {
    assert.equal(messageHasVisibleContent({ parts: [{ type: 'file' }] }), false)
  })

  await test('VC5: 有可见工具 → true', () => {
    assert.equal(messageHasVisibleContent({ parts: [{ toolName: 'web-search' }] }), true)
  })

  await test('VC6: 只有隐藏工具 → false', () => {
    assert.equal(messageHasVisibleContent({ parts: [{ toolName: 'ToolSearch' }] }), false)
  })

  await test('VC7: undefined/null → false', () => {
    assert.equal(messageHasVisibleContent(undefined), false)
    assert.equal(messageHasVisibleContent({ parts: undefined }), false)
    assert.equal(messageHasVisibleContent({ parts: [] }), false)
  })

  await test('VC8: 混合 parts — 一个可见就够', () => {
    assert.equal(
      messageHasVisibleContent({
        parts: [
          { type: 'text', text: '' },
          { toolName: 'ToolSearch' },
          { type: 'text', text: 'visible' },
        ],
      }),
      true,
    )
  })

  // =======================================================================
  // 4. displayMessages 计算
  // =======================================================================
  console.log('\n--- 4. displayMessages 计算 ---')

  const mkMsg = (id: string, role: string, text: string = 'x'): SimpleMessage => ({
    id,
    role,
    parts: text ? [{ type: 'text', text }] : [],
  })

  await test('DM1: 无流式消息 → 返回 staticMessages', () => {
    const msgs = [mkMsg('1', 'user'), mkMsg('2', 'assistant')]
    const result = computeDisplayMessages({
      staticMessages: msgs,
      streamingMessage: null,
      shouldShowThinking: false,
      hasStreamingVisibleContent: false,
      error: null,
    })
    assert.equal(result.length, 2)
  })

  await test('DM2: 有流式消息 → 追加到列表', () => {
    const statics = [mkMsg('1', 'user')]
    const streaming = mkMsg('2', 'assistant', 'streaming...')
    const result = computeDisplayMessages({
      staticMessages: statics,
      streamingMessage: streaming,
      shouldShowThinking: false,
      hasStreamingVisibleContent: true,
      error: null,
    })
    assert.equal(result.length, 2)
    assert.equal(result[1]!.id, '2')
  })

  await test('DM3: thinking 时不显示空流式消息', () => {
    const statics = [mkMsg('1', 'user')]
    const streaming = mkMsg('2', 'assistant', '')
    const result = computeDisplayMessages({
      staticMessages: statics,
      streamingMessage: streaming,
      shouldShowThinking: true,
      hasStreamingVisibleContent: false,
      error: null,
    })
    assert.equal(result.length, 1, 'shouldShowThinking + 无可见内容 → 不显示流式消息')
  })

  await test('DM4: thinking 但有可见内容 → 仍显示流式消息', () => {
    const statics = [mkMsg('1', 'user')]
    const streaming = mkMsg('2', 'assistant', 'partial')
    const result = computeDisplayMessages({
      staticMessages: statics,
      streamingMessage: streaming,
      shouldShowThinking: true,
      hasStreamingVisibleContent: true,
      error: null,
    })
    assert.equal(result.length, 2, 'thinking + 有可见内容 → 保留流式消息')
  })

  await test('DM5: 错误时移除空 assistant', () => {
    const msgs = [mkMsg('1', 'user'), mkMsg('2', 'assistant', '')]
    const result = computeDisplayMessages({
      staticMessages: msgs,
      streamingMessage: null,
      shouldShowThinking: false,
      hasStreamingVisibleContent: false,
      error: new Error('API error'),
    })
    assert.equal(result.length, 1, '空 assistant + 错误 → 移除')
    assert.equal(result[0]!.id, '1')
  })

  await test('DM6: 错误时移除文本与错误重复的 assistant', () => {
    const msgs = [mkMsg('1', 'user'), mkMsg('2', 'assistant', 'API error')]
    const result = computeDisplayMessages({
      staticMessages: msgs,
      streamingMessage: null,
      shouldShowThinking: false,
      hasStreamingVisibleContent: false,
      error: new Error('API error'),
    })
    assert.equal(result.length, 1, '文本与错误重复 → 移除')
  })

  await test('DM7: 错误但 assistant 有不同内容 → 保留', () => {
    const msgs = [mkMsg('1', 'user'), mkMsg('2', 'assistant', 'Some useful content')]
    const result = computeDisplayMessages({
      staticMessages: msgs,
      streamingMessage: null,
      shouldShowThinking: false,
      hasStreamingVisibleContent: false,
      error: new Error('API error'),
    })
    assert.equal(result.length, 2, '不同内容 → 保留')
  })

  await test('DM8: 错误时最后一条是 user → 不移除', () => {
    const msgs = [mkMsg('1', 'user')]
    const result = computeDisplayMessages({
      staticMessages: msgs,
      streamingMessage: null,
      shouldShowThinking: false,
      hasStreamingVisibleContent: false,
      error: new Error('error'),
    })
    assert.equal(result.length, 1, 'user 不被移除')
  })

  await test('DM9: 空列表 + 错误 → 空列表', () => {
    const result = computeDisplayMessages({
      staticMessages: [],
      streamingMessage: null,
      shouldShowThinking: false,
      hasStreamingVisibleContent: false,
      error: new Error('error'),
    })
    assert.equal(result.length, 0)
  })

  // =======================================================================
  // 5. preprocessChatText
  // =======================================================================
  console.log('\n--- 5. preprocessChatText ---')

  await test('CT1: 清除 <think> 块', () => {
    assert.equal(preprocessChatText('hello <think>internal thought</think> world'), 'hello  world')
  })

  await test('CT2: 清除多行 <think> 块', () => {
    const input = 'start<think>\nline1\nline2\n</think>end'
    assert.equal(preprocessChatText(input), 'startend')
  })

  await test('CT3: 清除未闭合的 <think> 标签', () => {
    assert.equal(preprocessChatText('hello <think>still thinking...'), 'hello ')
  })

  await test('CT4: CJK URL 边界添加空格', () => {
    const input = 'See https://example.com中文继续'
    const result = preprocessChatText(input)
    assert.ok(result.includes('https://example.com '), 'URL 后应有空格')
    assert.ok(result.includes(' 中文'), '中文前应有空格')
  })

  await test('CT5: 空输入', () => {
    assert.equal(preprocessChatText(''), '')
    assert.equal(preprocessChatText(null as any), null)
    assert.equal(preprocessChatText(undefined as any), undefined)
  })

  // =======================================================================
  // 6. branch-utils
  // =======================================================================
  console.log('\n--- 6. branch-utils ---')

  await test('BU1: resolveParentMessageId — 有 leafMessageId', () => {
    const result = resolveParentMessageId({
      explicitParentMessageId: undefined,
      leafMessageId: 'leaf1',
      messages: [{ id: 'msg1' }, { id: 'leaf1' }],
    })
    assert.equal(result, 'leaf1')
  })

  await test('BU2: resolveParentMessageId — leafMessageId 不在 messages 中', () => {
    const result = resolveParentMessageId({
      explicitParentMessageId: undefined,
      leafMessageId: 'not-in-list',
      messages: [{ id: 'msg1' }, { id: 'msg2' }],
    })
    assert.equal(result, 'msg2', '应回退到最后一条消息')
  })

  await test('BU3: resolveParentMessageId — 显式传入', () => {
    assert.equal(
      resolveParentMessageId({
        explicitParentMessageId: 'explicit',
        leafMessageId: 'leaf',
        messages: [{ id: 'msg1' }],
      }),
      'explicit',
    )
    assert.equal(
      resolveParentMessageId({
        explicitParentMessageId: null,
        leafMessageId: 'leaf',
        messages: [{ id: 'msg1' }],
      }),
      null,
      '显式 null 表示根节点',
    )
  })

  await test('BU4: resolveParentMessageId — 空消息', () => {
    assert.equal(
      resolveParentMessageId({
        explicitParentMessageId: undefined,
        leafMessageId: null,
        messages: [],
      }),
      null,
    )
  })

  await test('BU5: findParentUserForRetry — 使用 parentMessageId', () => {
    assert.equal(
      findParentUserForRetry({
        assistantMessageId: 'a1',
        assistantParentMessageId: 'u1',
        messages: [{ id: 'u1', role: 'user' }, { id: 'a1', role: 'assistant' }],
      }),
      'u1',
    )
  })

  await test('BU6: findParentUserForRetry — 兜底搜索', () => {
    assert.equal(
      findParentUserForRetry({
        assistantMessageId: 'a2',
        messages: [
          { id: 'u1', role: 'user' },
          { id: 'a1', role: 'assistant' },
          { id: 'u2', role: 'user' },
          { id: 'a2', role: 'assistant' },
        ],
      }),
      'u2',
    )
  })

  await test('BU7: findParentUserForRetry — 找不到 user', () => {
    assert.equal(
      findParentUserForRetry({
        assistantMessageId: 'a1',
        messages: [
          { id: 'sys', role: 'system' },
          { id: 'a1', role: 'assistant' },
        ],
      }),
      null,
    )
  })

  await test('BU8: sliceMessagesToParent — 正常截断', () => {
    const msgs = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]
    const result = sliceMessagesToParent(msgs, '2')
    assert.equal(result.length, 2)
    assert.equal(result[1]!.id, '2')
  })

  await test('BU9: sliceMessagesToParent — parent 不存在', () => {
    assert.deepEqual(sliceMessagesToParent([{ id: '1' }], 'nope'), [])
  })

  await test('BU10: sliceMessagesToParent — null parent', () => {
    assert.deepEqual(sliceMessagesToParent([{ id: '1' }], null), [])
  })

  // =======================================================================
  // 7. 边界情况和异常输入
  // =======================================================================
  console.log('\n--- 7. 边界和异常输入 ---')

  await test('EDGE1: normalizeParts 混合类型 parts', () => {
    const result = normalizeParts([
      { type: 'text', text: 'hello' },
      { type: 'tool-invoke', state: 'streaming' },
      { type: 'step-start' },
      { type: 'data-sub-agent-chunk' },
      { type: 'text', text: '' },
      { type: 'tool-result', state: 'output-available', toolName: 'search' },
      { type: 'reasoning', text: 'thinking' },
    ])
    assert.equal(result.length, 3, '应保留 text(hello) + tool-result + reasoning')
    assert.equal((result[0] as any).text, 'hello')
    assert.equal((result[1] as any).toolName, 'search')
    assert.equal((result[2] as any).type, 'reasoning')
  })

  await test('EDGE2: messageHasVisibleContent — 只有 reasoning → false', () => {
    assert.equal(
      messageHasVisibleContent({ parts: [{ type: 'reasoning', text: 'thinking...' }] }),
      false,
      'reasoning 不算可见内容',
    )
  })

  await test('EDGE3: 超长文本消息', () => {
    const longText = 'x'.repeat(100000)
    assert.equal(
      messageHasVisibleContent({ parts: [{ type: 'text', text: longText }] }),
      true,
    )
    assert.equal(getMessagePlainText({ parts: [{ type: 'text', text: longText }] }).length, 100000)
  })

  await test('EDGE4: Unicode 文本', () => {
    assert.equal(
      messageHasVisibleContent({ parts: [{ type: 'text', text: '你好世界 🌍' }] }),
      true,
    )
    assert.equal(getMessagePlainText({ parts: [{ type: 'text', text: '日本語テスト' }] }), '日本語テスト')
  })

  await test('EDGE5: 多个 text parts 合并', () => {
    const text = getMessagePlainText({
      parts: [
        { type: 'text', text: 'part1' },
        { type: 'tool-invoke', toolName: 'test' },
        { type: 'text', text: 'part2' },
      ],
    })
    assert.equal(text, 'part1\npart2', '多个 text parts 用换行合并')
  })

  await test('EDGE6: displayMessages — 错误文本有前后空格', () => {
    const msgs = [mkMsg('1', 'user'), mkMsg('2', 'assistant', '  API error  ')]
    const result = computeDisplayMessages({
      staticMessages: msgs,
      streamingMessage: null,
      shouldShowThinking: false,
      hasStreamingVisibleContent: false,
      error: new Error('API error'),
    })
    assert.equal(result.length, 1, '前后空格应被 trim 后匹配')
  })

  // ---- Summary ----
  console.log(`\n${'='.repeat(60)}`)
  console.log(`结果: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\n失败的测试:')
    for (const e of errors) console.log(`  - ${e}`)
  }
  console.log()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
