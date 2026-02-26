/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { describe, expect, it } from 'vitest'

import {
  findParentUserForRetry,
  isCommandAtStart,
  isCompactCommandMessage,
  isSessionCommandMessage,
  resolveParentMessageId,
  resolveResendParentMessageId,
  sliceMessagesToParent,
} from '../branch-utils'

// ---------------------------------------------------------------------------
// D: resolveParentMessageId
// ---------------------------------------------------------------------------
describe('resolveParentMessageId', () => {
  const msgs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('D1: explicit string -> use it', () => {
    expect(
      resolveParentMessageId({
        explicitParentMessageId: 'x',
        leafMessageId: 'b',
        messages: msgs,
      }),
    ).toBe('x')
  })

  it('D2: explicit null -> return null (root)', () => {
    expect(
      resolveParentMessageId({
        explicitParentMessageId: null,
        leafMessageId: 'b',
        messages: msgs,
      }),
    ).toBeNull()
  })

  it('D3: undefined, leafMessageId in messages -> use leafMessageId', () => {
    expect(
      resolveParentMessageId({
        explicitParentMessageId: undefined,
        leafMessageId: 'b',
        messages: msgs,
      }),
    ).toBe('b')
  })

  it('D4: undefined, leafMessageId NOT in messages -> use last message ID', () => {
    expect(
      resolveParentMessageId({
        explicitParentMessageId: undefined,
        leafMessageId: 'z',
        messages: msgs,
      }),
    ).toBe('c')
  })

  it('D5: undefined, messages empty -> null', () => {
    expect(
      resolveParentMessageId({
        explicitParentMessageId: undefined,
        leafMessageId: 'b',
        messages: [],
      }),
    ).toBeNull()
  })

  it('D6: undefined, leafMessageId null -> use last message ID', () => {
    expect(
      resolveParentMessageId({
        explicitParentMessageId: undefined,
        leafMessageId: null,
        messages: msgs,
      }),
    ).toBe('c')
  })
})

// ---------------------------------------------------------------------------
// E: findParentUserForRetry
// ---------------------------------------------------------------------------
describe('findParentUserForRetry', () => {
  const msgs = [
    { id: 'u1', role: 'user' },
    { id: 'a1', role: 'assistant' },
    { id: 'u2', role: 'user' },
    { id: 'a2', role: 'assistant' },
  ]

  it('E1: assistantParentMessageId exists -> return it', () => {
    expect(
      findParentUserForRetry({
        assistantMessageId: 'a2',
        assistantParentMessageId: 'u2',
        messages: msgs,
      }),
    ).toBe('u2')
  })

  it('E2: siblingNav has parentMessageId -> use it', () => {
    expect(
      findParentUserForRetry({
        assistantMessageId: 'a2',
        siblingNavParentMessageId: 'u1',
        messages: msgs,
      }),
    ).toBe('u1')
  })

  it('E3: neither, find user in messages -> return nearest user ID', () => {
    expect(
      findParentUserForRetry({
        assistantMessageId: 'a2',
        messages: msgs,
      }),
    ).toBe('u2')
  })

  it('E4: neither, no user before assistant -> null', () => {
    const onlyAssistant = [{ id: 'a1', role: 'assistant' }]
    expect(
      findParentUserForRetry({
        assistantMessageId: 'a1',
        messages: onlyAssistant,
      }),
    ).toBeNull()
  })

  it('E5: assistant not in messages -> null', () => {
    expect(
      findParentUserForRetry({
        assistantMessageId: 'missing',
        messages: msgs,
      }),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// F: sliceMessagesToParent
// ---------------------------------------------------------------------------
describe('sliceMessagesToParent', () => {
  const msgs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('F1: parentMessageId in messages -> slice to parent (inclusive)', () => {
    expect(sliceMessagesToParent(msgs, 'b')).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('F2: parentMessageId null -> empty array', () => {
    expect(sliceMessagesToParent(msgs, null)).toEqual([])
  })

  it('F3: parentMessageId not in messages -> empty array', () => {
    expect(sliceMessagesToParent(msgs, 'z')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// G: resolveResendParentMessageId
// ---------------------------------------------------------------------------
describe('resolveResendParentMessageId', () => {
  it('G1: string -> return it', () => {
    expect(resolveResendParentMessageId({ parentMessageId: 'p1' })).toBe('p1')
  })

  it('G2: null -> return null', () => {
    expect(resolveResendParentMessageId({ parentMessageId: null })).toBeNull()
  })

  it('G3: undefined -> return null', () => {
    expect(resolveResendParentMessageId({})).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// H: command detection
// ---------------------------------------------------------------------------
describe('isCommandAtStart', () => {
  it('H1: matches command at start (exact)', () => {
    expect(isCommandAtStart('/compact', '/compact')).toBe(true)
  })

  it('H2: command followed by space', () => {
    expect(isCommandAtStart('/compact hello', '/compact')).toBe(true)
  })

  it('H3: command followed by non-space char -> false', () => {
    expect(isCommandAtStart('/compactify', '/compact')).toBe(false)
  })
})

describe('isCompactCommandMessage', () => {
  const getPlainText = (msg: { parts: unknown[] }) =>
    (msg.parts[0] as string) ?? ''

  it('H4: messageKind=compact_prompt -> true', () => {
    expect(
      isCompactCommandMessage(
        { messageKind: 'compact_prompt' },
        getPlainText,
        '/compact',
      ),
    ).toBe(true)
  })

  it('falls back to text command detection', () => {
    expect(
      isCompactCommandMessage(
        { parts: ['/compact please'] },
        getPlainText,
        '/compact',
      ),
    ).toBe(true)
  })
})

describe('isSessionCommandMessage', () => {
  const getPlainText = (msg: { parts: unknown[] }) =>
    (msg.parts[0] as string) ?? ''

  it('H5: contains title command -> true', () => {
    expect(
      isSessionCommandMessage(
        { parts: ['/title'] },
        getPlainText,
        '/title',
      ),
    ).toBe(true)
  })

  it('no match -> false', () => {
    expect(
      isSessionCommandMessage(
        { parts: ['hello world'] },
        getPlainText,
        '/title',
      ),
    ).toBe(false)
  })
})
