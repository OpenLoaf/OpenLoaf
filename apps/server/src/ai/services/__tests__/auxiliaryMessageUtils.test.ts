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
  toSaasMessages,
} from '../auxiliaryMessageUtils'

function msg(role: 'user' | 'assistant' | 'system', parts: any[]): UIMessage {
  return { id: 'm', role, parts } as UIMessage
}

describe('modelHasMediaCapability', () => {
  it('returns false when tags are missing or empty', () => {
    expect(modelHasMediaCapability(undefined)).toBe(false)
    expect(modelHasMediaCapability({ id: 'm' } as ModelDefinition)).toBe(false)
    expect(modelHasMediaCapability({ id: 'm', tags: [] } as ModelDefinition)).toBe(false)
  })

  it('returns true for any of the media tags', () => {
    for (const tag of ['image_input', 'image_analysis', 'video_analysis', 'audio_analysis']) {
      expect(
        modelHasMediaCapability({ id: 'm', tags: [tag] as any } as ModelDefinition),
      ).toBe(true)
    }
  })

  it('returns false for non-media tags only', () => {
    expect(
      modelHasMediaCapability({
        id: 'm',
        tags: ['chat', 'reasoning', 'tool_call'] as any,
      } as ModelDefinition),
    ).toBe(false)
  })
})

describe('toSaasMessages', () => {
  it('converts text parts and skips empty messages', () => {
    const out = toSaasMessages([
      msg('user', [{ type: 'text', text: 'hi' }]),
      msg('assistant', []),
    ])
    expect(out).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
  })

  it('maps file parts from url to data, defaults mediaType', () => {
    const out = toSaasMessages([
      msg('user', [
        { type: 'file', url: 'https://cdn/a.jpg', mediaType: 'image/jpeg' },
        { type: 'file', url: 'data:image/png;base64,abc' }, // missing mediaType
      ]),
    ])
    expect(out[0]?.content).toEqual([
      { type: 'file', data: 'https://cdn/a.jpg', mediaType: 'image/jpeg' },
      { type: 'file', data: 'data:image/png;base64,abc', mediaType: 'application/octet-stream' },
    ])
  })

  it('drops unknown part types silently', () => {
    const out = toSaasMessages([
      msg('user', [
        { type: 'text', text: 'a' },
        { type: 'tool-call', toolName: 'x' } as any,
        { type: 'reasoning', text: 'y' } as any,
      ]),
    ])
    expect(out[0]?.content).toEqual([{ type: 'text', text: 'a' }])
  })

  it('preserves user/assistant/system roles; drops other roles', () => {
    const out = toSaasMessages([
      msg('user', [{ type: 'text', text: 'u' }]),
      msg('assistant', [{ type: 'text', text: 'a' }]),
      msg('system', [{ type: 'text', text: 's' }]),
      { id: 'x', role: 'subagent', parts: [{ type: 'text', text: 'sub' }] } as any,
    ])
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'system'])
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
