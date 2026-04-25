/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import type { ModelDefinition } from '@openloaf/api/common'
import {
  flattenMessagesToContext,
  messagesCacheSeed,
  modelHasMediaCapability,
} from '../auxiliaryMessageUtils'

function msg(role: 'user' | 'assistant' | 'system', parts: any[]): UIMessage {
  return { id: 'm', role, parts } as UIMessage
}

describe('modelHasMediaCapability', () => {
  it('returns false when capabilities are missing or empty', () => {
    expect(modelHasMediaCapability(undefined)).toBe(false)
    expect(modelHasMediaCapability({ id: 'm' } as ModelDefinition)).toBe(false)
    expect(
      modelHasMediaCapability({
        id: 'm',
        capabilities: { inputAccepts: [] },
      } as ModelDefinition),
    ).toBe(false)
  })

  it('returns true for any of the media accept types', () => {
    for (const accept of ['image', 'video', 'audio'] as const) {
      expect(
        modelHasMediaCapability({
          id: 'm',
          capabilities: { inputAccepts: [accept] },
        } as ModelDefinition),
      ).toBe(true)
    }
  })

  it('returns false when only text/file accepts are present', () => {
    expect(
      modelHasMediaCapability({
        id: 'm',
        capabilities: { inputAccepts: ['text', 'file'] },
      } as ModelDefinition),
    ).toBe(false)
  })
})

describe('flattenMessagesToContext', () => {
  it('role-prefixes text lines', () => {
    const out = flattenMessagesToContext([
      msg('user', [{ type: 'text', text: 'hello' }]),
      msg('assistant', [{ type: 'text', text: 'hi' }]),
    ])
    expect(out).toBe('User: hello\nAssistant: hi')
  })

  it('reduces attachment tags to filenames', () => {
    const out = flattenMessagesToContext([
      msg('user', [
        {
          type: 'text',
          text: '看看 <system-tag type="attachment" path="chat/pic.jpg" /> 这张',
        },
      ]),
    ])
    expect(out).toBe('User: 看看 pic.jpg 这张')
  })

  it('ignores non-text parts (file part already-upgraded content stays via attachment tag in text)', () => {
    const out = flattenMessagesToContext([
      msg('user', [
        { type: 'text', text: 'x' },
        { type: 'file', url: 'https://cdn/a.jpg', mediaType: 'image/jpeg' },
      ]),
    ])
    expect(out).toBe('User: x')
  })

  it('returns empty string for messages without text', () => {
    const out = flattenMessagesToContext([msg('user', [])])
    expect(out).toBe('')
  })
})

describe('messagesCacheSeed', () => {
  it('is stable for identical inputs', () => {
    const a = [msg('user', [{ type: 'text', text: 'x' }])]
    const b = [msg('user', [{ type: 'text', text: 'x' }])]
    expect(messagesCacheSeed(a)).toBe(messagesCacheSeed(b))
  })

  it('differs when text differs', () => {
    expect(
      messagesCacheSeed([msg('user', [{ type: 'text', text: 'a' }])]),
    ).not.toBe(messagesCacheSeed([msg('user', [{ type: 'text', text: 'b' }])]))
  })

  it('captures file url + mediaType', () => {
    const seed1 = messagesCacheSeed([
      msg('user', [{ type: 'file', url: 'https://cdn/a.jpg', mediaType: 'image/jpeg' }]),
    ])
    const seed2 = messagesCacheSeed([
      msg('user', [{ type: 'file', url: 'https://cdn/b.jpg', mediaType: 'image/jpeg' }]),
    ])
    expect(seed1).not.toBe(seed2)
  })

  it('ignores id fields (so re-renders with fresh UUIDs share cache)', () => {
    const a = { id: 'abc', role: 'user', parts: [{ type: 'text', text: 'x' }] } as UIMessage
    const b = { id: 'xyz', role: 'user', parts: [{ type: 'text', text: 'x' }] } as UIMessage
    expect(messagesCacheSeed([a])).toBe(messagesCacheSeed([b]))
  })
})
