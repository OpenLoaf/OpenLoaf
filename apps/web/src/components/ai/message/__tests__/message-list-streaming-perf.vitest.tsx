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
 * MessageList streaming render performance test.
 *
 * 验证 SSE 流式更新期间，历史消息的 MessageItem 是否被不必要地重渲染。
 * 当前实现 displayMessages 每次创建新数组引用，导致所有 MessageItem memo 失效。
 *
 * 基线测试：记录当前行为，修复后用于回归验证。
 */
import * as React from 'react'
import { render, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { mockMotion } from '../../__tests__/vitest-mocks'
import type { UIMessage } from '@ai-sdk/react'

mockMotion()

// Mock heavy dependencies
vi.mock('../tools/MessageTool', () => ({ default: () => null }))
vi.mock('../tools/MessageFile', () => ({ default: () => null }))
vi.mock('../AssistantMessageHeader', () => ({ default: () => null }))
vi.mock('../../input/ChatInput', () => ({ ChatInputBox: () => null }))

// ---------------------------------------------------------------------------
// Render counting infrastructure
// ---------------------------------------------------------------------------

const renderCounts = new Map<string, number>()

function resetRenderCounts() {
  renderCounts.clear()
}

function trackRender(id: string) {
  renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1)
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMessage(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text' as const, text }],
    createdAt: new Date(),
  } as UIMessage
}

// ---------------------------------------------------------------------------
// Tests for useStreamingMessageBuffer
// ---------------------------------------------------------------------------

describe('useStreamingMessageBuffer reference stability', () => {
  it('[BASELINE] staticMessages reference is stable when only streaming message changes', async () => {
    const { useStreamingMessageBuffer } = await import('../../hooks/use-streaming-message-buffer')

    const results: Array<{ staticRef: unknown; streamingRef: unknown }> = []

    function TestHarness({ messages, status }: { messages: UIMessage[]; status: string }) {
      const { staticMessages, streamingMessage } = useStreamingMessageBuffer({
        messages,
        status: status as any,
        isHistoryLoading: false,
      })
      React.useEffect(() => {
        results.push({ staticRef: staticMessages, streamingRef: streamingMessage })
      })
      return null
    }

    // 3 条历史消息 + 1 条正在流式的 assistant
    const history = [
      makeMessage('u1', 'user', 'Hello'),
      makeMessage('a1', 'assistant', 'Hi there'),
      makeMessage('u2', 'user', 'What is React?'),
    ]
    const streaming1: UIMessage = makeMessage('a2', 'assistant', 'React is...')

    const { rerender } = render(
      <TestHarness messages={[...history, streaming1]} status="streaming" />,
    )

    // 模拟 SSE chunk 更新：只有 streaming message 变化
    const streaming2: UIMessage = makeMessage('a2', 'assistant', 'React is a library...')
    rerender(<TestHarness messages={[...history, streaming2]} status="streaming" />)

    const streaming3: UIMessage = makeMessage('a2', 'assistant', 'React is a library for building UIs')
    rerender(<TestHarness messages={[...history, streaming3]} status="streaming" />)

    // 验证 staticMessages 引用稳定性
    const staticRefs = results.map(r => r.staticRef)
    const allStaticSame = staticRefs.every(ref => ref === staticRefs[0])

    console.log(`[BASELINE] staticMessages reference stable: ${allStaticSame}`)
    console.log(`[BASELINE] Total renders: ${results.length}`)

    // useStreamingMessageBuffer 的 areMessagesEqualByRef 应该保证引用稳定
    // 如果这里失败，说明 staticMessages 被不必要地重建
    expect(allStaticSame).toBe(true)
  })
})

describe('MessageList displayMessages cascade', () => {
  it('[BASELINE] measures how displayMessages rebuild affects messageNodes', () => {
    // 模拟 displayMessages 每次都是新数组引用
    const history = Array.from({ length: 5 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`),
    )

    // 模拟当前 displayMessages 逻辑
    const streamingMsg = makeMessage('streaming', 'assistant', 'Streaming...')
    const display1 = [...history, streamingMsg]
    const display2 = [...history, { ...streamingMsg, parts: [{ type: 'text' as const, text: 'Streaming... more' }] }]

    // 验证数组引用（这是 memo 失效的根因）
    const arraysAreDifferentRef = display1 !== display2
    const historyItemsSameRef = history.every((msg, i) => display1[i] === display2[i])

    console.log(`[BASELINE] displayMessages array ref changes on streaming update: ${arraysAreDifferentRef}`)
    console.log(`[BASELINE] History items maintain same ref: ${historyItemsSameRef}`)
    console.log(`[BASELINE] Only streaming item ref changes: ${display1[5] !== display2[5]}`)

    // 当前行为：数组引用每次都变，但内部历史消息引用不变
    expect(arraysAreDifferentRef).toBe(true) // 数组总是新的
    expect(historyItemsSameRef).toBe(true)   // 历史项引用稳定

    // 关键洞察：useMemo(messageNodes, [displayMessages]) 因数组引用变化而失效，
    // 导致所有 MessageItem 重新创建，即使内部 message 引用没变。
    // 修复后：应该将 static 和 streaming 分离渲染，避免 memo 失效。
    console.log(
      '\n💡 Fix: split messageNodes into staticNodes (stable) + streamingNode (changes)\n' +
      '   so React.memo on MessageItem can skip re-render for history messages.',
    )
  })

  it('[BASELINE] React.memo on MessageItem should prevent re-render for stable props', () => {
    let renderCount = 0

    const MemoTest = React.memo(function TestItem({ id }: { id: string }) {
      renderCount += 1
      return <div>{id}</div>
    })

    function Parent({ items, extra }: { items: string[]; extra: string }) {
      return (
        <div>
          {items.map(id => <MemoTest key={id} id={id} />)}
          <div>{extra}</div>
        </div>
      )
    }

    // 初始渲染 5 个 item
    const items = ['a', 'b', 'c', 'd', 'e']
    const { rerender } = render(<Parent items={items} extra="v1" />)
    const initialRenders = renderCount
    expect(initialRenders).toBe(5)

    // 只改变 extra（不影响 items），验证 memo 是否生效
    rerender(<Parent items={items} extra="v2" />)
    const afterExtraChange = renderCount
    console.log(`[BASELINE] MemoTest renders after extra change: ${afterExtraChange - initialRenders} (expected: 0)`)
    expect(afterExtraChange - initialRenders).toBe(0)

    // 传入新数组引用但内容相同 — 关键：items 在 map 中展开时，
    // 如果 key 和 props 都没变，memo 仍然生效
    rerender(<Parent items={[...items]} extra="v3" />)
    const afterNewArrayRef = renderCount
    console.log(`[BASELINE] MemoTest renders after new array ref: ${afterNewArrayRef - afterExtraChange} (expected: 0)`)

    // React.memo 比较的是单个 component 的 props，不是父层的 array ref
    // 所以即使 items 数组引用变了，只要 key + props 不变，memo 仍然有效
    expect(afterNewArrayRef - afterExtraChange).toBe(0)

    // 但如果 items 中的对象引用变了（当前 MessageList 的问题）：
    const newItems = items.map(id => id) // 字符串是值类型，引用不变
    rerender(<Parent items={newItems} extra="v4" />)
    const afterValueItems = renderCount
    console.log(`[BASELINE] MemoTest renders after value-type items: ${afterValueItems - afterNewArrayRef} (expected: 0)`)
    expect(afterValueItems - afterNewArrayRef).toBe(0)

    console.log(
      '\n💡 Key insight: React.memo on MessageItem DOES work for stable message refs.\n' +
      '   The real problem is useMemo(messageNodes, [displayMessages]) — it recreates\n' +
      '   ALL <MessageItem> elements when displayMessages ref changes, bypassing memo.\n' +
      '   Fix: remove the outer useMemo wrapper, let React.memo handle individual items.',
    )
  })
})
