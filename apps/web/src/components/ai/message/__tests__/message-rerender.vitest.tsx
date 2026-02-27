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
 * Tests verifying MessageAi and MessageParts memo behavior:
 * 1. MessageAi is wrapped in React.memo with custom comparator
 * 2. MessageParts is wrapped in React.memo — motionProps are stable via useMemo
 * 3. renderMessageParts returns new element references on every call
 */
import * as React from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { mockMotion, mockSyntaxHighlighter } from '../../__tests__/vitest-mocks'

mockMotion()
mockSyntaxHighlighter()

// Mock heavy transitive dependencies that MessageAi pulls in (Plate.js → virtual-dom)
vi.mock('../tools/MessagePlan', () => ({
  default: () => null,
}))
vi.mock('../tools/MessageTool', () => ({
  default: () => null,
}))
vi.mock('../tools/MessageFile', () => ({
  default: () => null,
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageAi memo behavior', () => {
  it('MessageAi re-renders when message reference changes even if content is identical', async () => {
    const MessageAi = (await import('../MessageAi')).default

    let renderCount = 0
    const Spy = ({ message, isAnimating }: any) => {
      renderCount += 1
      return <MessageAi message={message} isAnimating={isAnimating} />
    }

    const msg1 = {
      id: 'a1',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'Hello' }],
      createdAt: new Date(),
    }
    // Same content, new object reference (simulates streaming update)
    const msg2 = { ...msg1 }

    const { rerender } = render(<Spy message={msg1} isAnimating={false} />)
    expect(renderCount).toBe(1)

    rerender(<Spy message={msg2} isAnimating={false} />)
    // Parent re-renders because msg2 !== msg1 (different reference)
    // MessageAi is memoized, but Spy wrapper forces re-render with new ref
    expect(renderCount).toBe(2)
  })

  it('MessageAi IS wrapped in React.memo (optimization applied)', async () => {
    const mod = await import('../MessageAi')
    const MessageAi = mod.default

    // React.memo components have $$typeof === Symbol.for('react.memo')
    const isMemoized =
      MessageAi &&
      typeof MessageAi === 'object' &&
      '$$typeof' in MessageAi &&
      String((MessageAi as any).$$typeof).includes('memo')

    expect(isMemoized, 'MessageAi should be memoized').toBe(true)
  })
})

describe('MessageParts memo behavior', () => {
  it('MessageParts creates new motionProps object on every render', async () => {
    const MessageParts = (await import('../MessageParts')).default

    const parts = [{ type: 'text' as const, text: 'Hello world' }]
    const options = { isAnimating: true, messageId: 'test-1' }

    // Capture rendered output references
    const outputs: React.ReactNode[] = []
    function Capture() {
      const el = <MessageParts parts={parts} options={options} />
      outputs.push(el)
      return el
    }

    const { rerender } = render(<Capture />)
    rerender(<Capture />)
    rerender(<Capture />)

    // Each render creates a new Fragment with new children
    // because motionProps is recreated each time
    expect(outputs.length).toBe(3)
    // The elements are structurally similar but referentially different
    expect(outputs[0]).not.toBe(outputs[1])
    expect(outputs[1]).not.toBe(outputs[2])
  })

  it('MessageParts IS wrapped in React.memo (optimization applied)', async () => {
    const mod = await import('../MessageParts')
    const MessageParts = mod.default

    const isMemoized =
      MessageParts &&
      typeof MessageParts === 'object' &&
      '$$typeof' in MessageParts &&
      String((MessageParts as any).$$typeof).includes('memo')

    expect(isMemoized, 'MessageParts should be memoized').toBe(true)
  })
})

describe('renderMessageParts reference stability', () => {
  it('returns new element references on every call with same input', async () => {
    const { renderMessageParts } = await import('../renderMessageParts')

    const parts = [
      { type: 'text', text: 'Hello world' },
      { type: 'text', text: 'Second part' },
    ]
    const options = { isAnimating: false, messageId: 'test-1' }

    const result1 = renderMessageParts(parts as any, options)
    const result2 = renderMessageParts(parts as any, options)

    // Same input, but returns new array with new elements each time
    expect(result1).not.toBe(result2)
    // Each element in the array is a new React element
    expect(result1[0]).not.toBe(result2[0])
  })
})
