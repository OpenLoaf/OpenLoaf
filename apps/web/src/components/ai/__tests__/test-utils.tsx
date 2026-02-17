import * as React from 'react'
import type { UIMessage } from '@ai-sdk/react'

// ---------------------------------------------------------------------------
// Mock message factory
// ---------------------------------------------------------------------------

let _msgCounter = 0

/** Create a mock UIMessage with sensible defaults. */
export function createMockMessage(
  overrides: Partial<UIMessage> & { role?: 'user' | 'assistant' } = {},
): UIMessage {
  _msgCounter += 1
  const id = overrides.id ?? `msg-${_msgCounter}`
  const role = overrides.role ?? 'assistant'
  const parts = overrides.parts ?? [{ type: 'text' as const, text: 'Hello' }]
  return { id, role, parts, createdAt: new Date() } as UIMessage
}

// ---------------------------------------------------------------------------
// Streaming sequence generator
// ---------------------------------------------------------------------------

/** Generate a sequence of assistant messages simulating streaming chunks. */
export function createStreamingSequence(
  fullText: string,
  chunkSize = 10,
): UIMessage[] {
  const seq: UIMessage[] = []
  const id = `stream-${++_msgCounter}`
  for (let i = chunkSize; i <= fullText.length; i += chunkSize) {
    seq.push({
      id,
      role: 'assistant',
      parts: [{ type: 'text' as const, text: fullText.slice(0, i) }],
      createdAt: new Date(),
    } as UIMessage)
  }
  // Ensure the last chunk includes the full text
  if (seq.length === 0 || (seq[seq.length - 1].parts as any)[0].text !== fullText) {
    seq.push({
      id,
      role: 'assistant',
      parts: [{ type: 'text' as const, text: fullText }],
      createdAt: new Date(),
    } as UIMessage)
  }
  return seq
}

// ---------------------------------------------------------------------------
// Render count hook
// ---------------------------------------------------------------------------

/** Hook that tracks how many times the host component rendered. */
export function useRenderCount(): React.MutableRefObject<number> {
  const count = React.useRef(0)
  count.current += 1
  return count
}

// ---------------------------------------------------------------------------
// Fixtures — various markdown content for benchmarks
// ---------------------------------------------------------------------------

export const FIXTURES = {
  plainText: Array.from({ length: 50 }, (_, i) => `This is sentence number ${i + 1}.`).join(' '),

  codeBlocks: Array.from(
    { length: 10 },
    (_, i) =>
      `\`\`\`javascript\nfunction example${i}() {\n  const x = ${i};\n  return x * 2;\n}\n\`\`\``,
  ).join('\n\n'),

  table: [
    '| Col1 | Col2 | Col3 | Col4 | Col5 | Col6 | Col7 | Col8 |',
    '|------|------|------|------|------|------|------|------|',
    ...Array.from(
      { length: 20 },
      (_, r) =>
        `| ${Array.from({ length: 8 }, (__, c) => `R${r}C${c}`).join(' | ')} |`,
    ),
  ].join('\n'),

  mixed: [
    '# AI Response',
    '',
    'Here is a **summary** of the analysis:',
    '',
    '1. First point with `inline code`',
    '2. Second point',
    '',
    '```python',
    'def hello():',
    '    print("world")',
    '```',
    '',
    '> Important note about the results',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    '| Speed  | 100ms |',
    '| Memory | 50MB  |',
    '',
    'Final paragraph with [a link](https://example.com).',
  ].join('\n'),
} as const
