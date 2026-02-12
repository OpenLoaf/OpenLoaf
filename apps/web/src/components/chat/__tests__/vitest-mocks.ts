/**
 * Shared mock setup for chat performance tests.
 *
 * Mock strategy:
 * - `motion/react` → motion.div replaced with plain div, useReducedMotion returns false
 * - `react-syntax-highlighter` → simple <pre> tag (only for render-count tests)
 */
import { vi } from 'vitest'

/** Install motion/react mock — call in beforeAll or at module top level. */
export function mockMotion() {
  vi.mock('motion/react', () => {
    const React = require('react')
    const handler: ProxyHandler<any> = {
      get(_target: any, prop: string) {
        // motion.div, motion.span, etc. → forward as plain HTML element
        return React.forwardRef((props: any, ref: any) => {
          const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props
          return React.createElement(prop, { ...rest, ref })
        })
      },
    }
    return {
      motion: new Proxy({}, handler),
      AnimatePresence: ({ children }: any) => children,
      useReducedMotion: () => false,
    }
  })
}

/** Install react-syntax-highlighter mock — renders a simple <pre>. */
export function mockSyntaxHighlighter() {
  vi.mock('react-syntax-highlighter', () => {
    const React = require('react')
    const SyntaxHighlighter = React.forwardRef(
      ({ children, ...rest }: any, ref: any) =>
        React.createElement('pre', { ref, 'data-testid': 'mock-syntax-highlighter' }, children),
    )
    SyntaxHighlighter.displayName = 'MockSyntaxHighlighter'
    return { Prism: SyntaxHighlighter, default: SyntaxHighlighter }
  })
  vi.mock('react-syntax-highlighter/dist/cjs/styles/prism', () => ({
    oneDark: {},
  }))
}
