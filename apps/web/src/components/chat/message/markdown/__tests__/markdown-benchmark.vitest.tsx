/**
 * Markdown rendering benchmark tests.
 * Establishes baseline render costs for different content types.
 */
import * as React from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { mockMotion, mockSyntaxHighlighter } from '../../../__tests__/vitest-mocks'
import { FIXTURES } from '../../../__tests__/test-utils'

mockMotion()
mockSyntaxHighlighter()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function measureRenderMs(element: React.ReactElement, iterations = 3): number {
  // Warm up
  const { unmount: warmUnmount } = render(element)
  warmUnmount()

  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const { unmount } = render(element)
    const elapsed = performance.now() - start
    unmount()
    times.push(elapsed)
  }
  return times.reduce((a, b) => a + b, 0) / times.length
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe('Markdown rendering baselines', () => {
  let Streamdown: any

  it('load Streamdown', async () => {
    const mod = await import('streamdown')
    Streamdown = mod.Streamdown
    expect(Streamdown).toBeDefined()
  })

  it('baseline: plain text (~500 words)', async () => {
    if (!Streamdown) {
      const mod = await import('streamdown')
      Streamdown = mod.Streamdown
    }
    const ms = measureRenderMs(<Streamdown>{FIXTURES.plainText}</Streamdown>)
    // Record baseline — just ensure it renders in reasonable time
    console.log(`[benchmark] plain text: ${ms.toFixed(2)}ms`)
    expect(ms).toBeLessThan(500) // generous upper bound for CI
  })

  it('baseline: 10 code blocks', async () => {
    if (!Streamdown) {
      const mod = await import('streamdown')
      Streamdown = mod.Streamdown
    }
    const ms = measureRenderMs(<Streamdown>{FIXTURES.codeBlocks}</Streamdown>)
    console.log(`[benchmark] 10 code blocks: ${ms.toFixed(2)}ms`)
    expect(ms).toBeLessThan(2000)
  })

  it('baseline: large table 20x8', async () => {
    if (!Streamdown) {
      const mod = await import('streamdown')
      Streamdown = mod.Streamdown
    }
    const ms = measureRenderMs(<Streamdown>{FIXTURES.table}</Streamdown>)
    console.log(`[benchmark] 20x8 table: ${ms.toFixed(2)}ms`)
    expect(ms).toBeLessThan(1000)
  })

  it('baseline: mixed content (typical AI reply)', async () => {
    if (!Streamdown) {
      const mod = await import('streamdown')
      Streamdown = mod.Streamdown
    }
    const ms = measureRenderMs(<Streamdown>{FIXTURES.mixed}</Streamdown>)
    console.log(`[benchmark] mixed content: ${ms.toFixed(2)}ms`)
    expect(ms).toBeLessThan(1000)
  })

  it('baseline: incremental streaming cost (append 10 chars per update)', async () => {
    if (!Streamdown) {
      const mod = await import('streamdown')
      Streamdown = mod.Streamdown
    }
    const base = 'This is a streaming test. '
    const fullText = base.repeat(20) // ~500 chars

    // Measure cost of 20 incremental updates
    const { rerender, unmount } = render(
      <Streamdown>{base}</Streamdown>,
    )

    const start = performance.now()
    for (let i = 2; i <= 20; i++) {
      rerender(<Streamdown>{base.repeat(i)}</Streamdown>)
    }
    const totalMs = performance.now() - start
    const avgMs = totalMs / 19

    unmount()

    console.log(
      `[benchmark] incremental update: avg ${avgMs.toFixed(2)}ms per update, total ${totalMs.toFixed(2)}ms for 19 updates`,
    )
    expect(avgMs).toBeLessThan(200) // generous bound
  })

  it('code blocks cost significantly more than plain text', async () => {
    if (!Streamdown) {
      const mod = await import('streamdown')
      Streamdown = mod.Streamdown
    }
    const plainMs = measureRenderMs(
      <Streamdown>{FIXTURES.plainText}</Streamdown>,
      5,
    )
    const codeMs = measureRenderMs(
      <Streamdown>{FIXTURES.codeBlocks}</Streamdown>,
      5,
    )

    const ratio = codeMs / Math.max(plainMs, 0.1)
    console.log(
      `[benchmark] code/plain ratio: ${ratio.toFixed(1)}x (plain=${plainMs.toFixed(2)}ms, code=${codeMs.toFixed(2)}ms)`,
    )
    // Code blocks should be noticeably more expensive
    // (even with mocked SyntaxHighlighter, the parsing overhead remains)
    expect(ratio).toBeGreaterThan(1)
  })
})
