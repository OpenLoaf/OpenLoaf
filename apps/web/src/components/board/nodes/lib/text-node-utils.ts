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
 * Extract plain text from a TextNode value prop.
 *
 * The value can be a plain string (legacy) or a Slate Value (array of element
 * nodes with nested `children[].text` leaves). This function handles both
 * formats and returns a single plain-text string.
 */
export function extractTextNodePlainText(value: unknown): string {
  if (typeof value === 'string') return value

  if (!Array.isArray(value)) return ''

  const lines: string[] = []
  for (const node of value) {
    if (!node || typeof node !== 'object') continue
    const children = (node as Record<string, unknown>).children
    if (!Array.isArray(children)) continue
    const lineText = children
      .map((child: unknown) => {
        if (!child || typeof child !== 'object') return ''
        return typeof (child as Record<string, unknown>).text === 'string'
          ? ((child as Record<string, unknown>).text as string)
          : ''
      })
      .join('')
    lines.push(lineText)
  }
  return lines.join('\n')
}
