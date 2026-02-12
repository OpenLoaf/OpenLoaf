/**
 * Integration-level streaming simulation tests.
 * Records render counts at each layer as a pre-optimization baseline.
 */
import * as React from 'react'
import { act, render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { mockMotion, mockSyntaxHighlighter } from '../__tests__/vitest-mocks'
import { createMockMessage, createStreamingSequence } from '../__tests__/test-utils'

mockMotion()
mockSyntaxHighlighter()

// Mock heavy transitive deps
vi.mock('./message/tools/MessagePlan', () => ({ default: () => null }))
vi.mock('./message/tools/MessageTool', () => ({ default: () => null }))
vi.mock('./message/tools/MessageFile', () => ({ default: () => null }))

// ---------------------------------------------------------------------------
// Render-counting wrappers
// ---------------------------------------------------------------------------

const renderCounts = {
  messageAi: 0,
  messageParts: 0,
  streamdown: 0,
}

function resetCounts() {
  renderCounts.messageAi = 0
  renderCounts.messageParts = 0
  renderCounts.streamdown = 0
}

// ---------------------------------------------------------------------------
// Simplified message rendering pipeline (mirrors production structure)
// ---------------------------------------------------------------------------

/** Simplified MessageAi — Simplified stand-in (production uses React.memo) */
function SimMessageAi({ message, isAnimating }: { message: any; isAnimating?: boolean }) {
  renderCounts.messageAi += 1
  return <SimMessageParts parts={message.parts} isAnimating={isAnimating} />
}

/** Simplified MessageParts — Simplified stand-in (production uses React.memo) */
function SimMessageParts({ parts, isAnimating }: { parts: any[]; isAnimating?: boolean }) {
  renderCounts.messageParts += 1
  // This recreates motionProps on every render
  const _motionProps = isAnimating
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : undefined
  return (
    <>
      {(parts ?? []).map((part: any, i: number) => {
        if (part?.type === 'text') {
          return <SimStreamdown key={i} content={part.text} />
        }
        return null
      })}
    </>
  )
}

/** Simplified Streamdown stand-in that counts renders */
function SimStreamdown({ content }: { content: string }) {
  renderCounts.streamdown += 1
  return <div data-testid="streamdown">{content}</div>
}

/** Memoized message item (matches production MessageItem) */
const SimMessageItem = React.memo(function SimMessageItem({
  message,
  isAnimating,
}: {
  message: any
  isAnimating?: boolean
}) {
  if (message.role === 'user') {
    return <div data-testid="user-msg">{(message.parts?.[0] as any)?.text}</div>
  }
  return <SimMessageAi message={message} isAnimating={isAnimating} />
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Streaming integration baseline', () => {
  it('50-token streaming: records render counts at each layer', () => {
    const fullText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')
    const chunks = createStreamingSequence(fullText, 20)

    resetCounts()

    const { rerender, unmount } = render(
      <SimMessageItem message={chunks[0]} isAnimating />,
    )

    for (let i = 1; i < chunks.length; i++) {
      rerender(<SimMessageItem message={chunks[i]} isAnimating />)
    }

    const totalUpdates = chunks.length
    console.log(`[streaming-baseline] ${totalUpdates} chunks:`, {
      messageAi: renderCounts.messageAi,
      messageParts: renderCounts.messageParts,
      streamdown: renderCounts.streamdown,
    })

    // Each chunk cascades through the simplified (un-memoized) test layers
    // MessageAi renders = number of chunks (no memo)
    expect(renderCounts.messageAi).toBe(totalUpdates)
    // MessageParts renders = number of chunks (no memo)
    expect(renderCounts.messageParts).toBe(totalUpdates)
    // Streamdown renders = number of chunks (content changes each time)
    expect(renderCounts.streamdown).toBe(totalUpdates)

    unmount()
  })

  it('10 history messages + 1 streaming: history messages do NOT re-render', () => {
    // Create 10 history messages (5 user + 5 assistant pairs)
    const historyMessages = Array.from({ length: 10 }, (_, i) => {
      const role = i % 2 === 0 ? 'user' : 'assistant'
      return createMockMessage({
        id: `hist-${i}`,
        role: role as any,
        parts: [{ type: 'text' as const, text: `History message ${i}` }],
      })
    })

    // Track history item render counts
    let historyRenderCount = 0

    const HistoryItem = React.memo(function HistoryItem({ message }: { message: any }) {
      historyRenderCount += 1
      if (message.role === 'user') {
        return <div>{(message.parts?.[0] as any)?.text}</div>
      }
      return <div>{(message.parts?.[0] as any)?.text}</div>
    })

    function MessageList({
      messages,
      streamingMessage,
    }: {
      messages: any[]
      streamingMessage: any | null
    }) {
      return (
        <div>
          {messages.map((msg: any) => (
            <HistoryItem key={msg.id} message={msg} />
          ))}
          {streamingMessage && (
            <SimMessageItem
              key={streamingMessage.id}
              message={streamingMessage}
              isAnimating
            />
          )}
        </div>
      )
    }

    // Initial render with history + first streaming chunk
    const streamChunks = createStreamingSequence(
      'This is a streaming response with some content.',
      10,
    )

    const { rerender, unmount } = render(
      <MessageList messages={historyMessages} streamingMessage={streamChunks[0]} />,
    )

    const initialHistoryRenders = historyRenderCount
    expect(initialHistoryRenders).toBe(10) // each history item renders once

    // Reset and stream more chunks
    historyRenderCount = 0
    resetCounts()

    for (let i = 1; i < streamChunks.length; i++) {
      rerender(
        <MessageList messages={historyMessages} streamingMessage={streamChunks[i]} />,
      )
    }

    // History messages should NOT re-render (they're memoized and refs are stable)
    expect(historyRenderCount).toBe(0)

    // But the streaming message re-renders on every chunk
    const streamUpdates = streamChunks.length - 1
    expect(renderCounts.messageAi).toBe(streamUpdates)

    console.log(`[streaming-baseline] history re-renders: ${historyRenderCount}`)
    console.log(`[streaming-baseline] streaming updates: ${streamUpdates}`, {
      messageAi: renderCounts.messageAi,
      messageParts: renderCounts.messageParts,
      streamdown: renderCounts.streamdown,
    })

    unmount()
  })
})
