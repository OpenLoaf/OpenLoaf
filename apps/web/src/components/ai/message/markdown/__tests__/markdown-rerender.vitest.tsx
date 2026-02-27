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
 * Tests verifying that MarkdownComponents memo optimization works correctly:
 * memoized components skip re-renders when props are identical during streaming.
 */
import * as React from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { mockMotion, mockSyntaxHighlighter } from '../../../__tests__/vitest-mocks'

// Install mocks before any component imports
mockMotion()
mockSyntaxHighlighter()

// ---------------------------------------------------------------------------
// Render-counting wrappers
// ---------------------------------------------------------------------------

/** Create a component that counts renders and forwards to a plain HTML tag. */
function createCountingComponent(
  Tag: keyof React.JSX.IntrinsicElements,
  counter: { current: number },
) {
  const Comp = (props: any) => {
    const { node: _node, ...rest } = props
    counter.current += 1
    return React.createElement(Tag, rest)
  }
  Comp.displayName = `Counting_${Tag}`
  return Comp
}

/** Same but wrapped in React.memo. */
function createMemoCountingComponent(
  Tag: keyof React.JSX.IntrinsicElements,
  counter: { current: number },
) {
  const Inner = (props: any) => {
    const { node: _node, ...rest } = props
    counter.current += 1
    return React.createElement(Tag, rest)
  }
  Inner.displayName = `MemoCounting_${Tag}`
  return React.memo(Inner)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarkdownComponents memo optimization', () => {
  it('un-memoized component re-renders unconditionally when parent re-renders', () => {
    const pRenderCount = { current: 0 }
    const UnmemoP = createCountingComponent('p', pRenderCount)

    function Parent() {
      return (
        <div>
          <UnmemoP className="test">Static content that never changes</UnmemoP>
        </div>
      )
    }

    const { rerender } = render(<Parent />)
    expect(pRenderCount.current).toBe(1)

    // Reset and do controlled re-renders with identical props
    pRenderCount.current = 0
    rerender(<Parent />)
    rerender(<Parent />)
    rerender(<Parent />)

    // Un-memoized: renders 3 times even though props are identical
    expect(pRenderCount.current).toBe(3)
  })

  it('memo-wrapped component skips re-render when props are identical', () => {
    const pRenderCount = { current: 0 }
    const MemoP = createMemoCountingComponent('p', pRenderCount)

    function Parent() {
      return (
        <div>
          <MemoP className="test">Static content that never changes</MemoP>
        </div>
      )
    }

    const { rerender } = render(<Parent />)
    expect(pRenderCount.current).toBe(1)

    pRenderCount.current = 0
    rerender(<Parent />)
    rerender(<Parent />)
    rerender(<Parent />)

    // Memo-wrapped: skips all 3 re-renders since props are identical
    expect(pRenderCount.current).toBe(0)
  })

  it('streaming simulation: un-memoized components accumulate renders across chunks', async () => {
    const { Streamdown } = await import('streamdown')

    const pCount = { current: 0 }
    const strongCount = { current: 0 }
    const liCount = { current: 0 }
    const UnmemoP = createCountingComponent('p', pCount)
    const UnmemoStrong = createCountingComponent('strong', strongCount)
    const UnmemoLi = createCountingComponent('li', liCount)

    const components = { p: UnmemoP, strong: UnmemoStrong, li: UnmemoLi }

    // Simulate streaming: content grows with each "chunk"
    const chunks = [
      'Hello **world**.',
      'Hello **world**.\n\n- Item 1',
      'Hello **world**.\n\n- Item 1\n- Item 2',
      'Hello **world**.\n\n- Item 1\n- Item 2\n- Item 3',
      'Hello **world**.\n\n- Item 1\n- Item 2\n- Item 3\n\nFinal paragraph.',
    ]

    const { rerender } = render(
      <Streamdown components={components}>{chunks[0]}</Streamdown>,
    )

    // Reset after initial render
    const initialP = pCount.current
    const initialStrong = strongCount.current
    pCount.current = 0
    strongCount.current = 0
    liCount.current = 0

    // Stream 4 more chunks
    for (let i = 1; i < chunks.length; i++) {
      rerender(<Streamdown components={components}>{chunks[i]}</Streamdown>)
    }

    // Key observation: un-memoized components accumulate renders.
    // The first paragraph ("Hello **world**.") hasn't changed after chunk[0],
    // but its P and STRONG components still re-render on some updates
    // because Streamdown re-parses blocks.
    // Total P renders across 4 updates should be significant.
    const totalRenders = pCount.current + strongCount.current + liCount.current
    expect(totalRenders).toBeGreaterThan(4) // many redundant renders
  })

  it('production markdownComponents are all memoized', async () => {
    // Import the actual production components
    const { markdownComponents } = await import('../MarkdownComponents')

    const componentNames = Object.keys(markdownComponents)
    expect(componentNames.length).toBeGreaterThanOrEqual(14)

    // Verify ALL of them are memoized (optimization applied)
    for (const [name, comp] of Object.entries(markdownComponents)) {
      const isMemoized =
        comp &&
        typeof comp === 'object' &&
        '$$typeof' in comp &&
        String((comp as any).$$typeof).includes('memo')
      expect(isMemoized, `${name} should be memoized`).toBe(true)
    }
  })
})
