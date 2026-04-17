/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_TAG_REGEX,
  extractAttachmentTagPath,
  formatAttachmentTag,
  hasAttachmentTag,
  parseAttachmentTagAttrs,
  replaceAttachmentTags,
  stripAttachmentTagWrapper,
} from '@openloaf/api/common'

describe('attachmentTag V2', () => {
  describe('parseAttachmentTagAttrs', () => {
    it('parses the lone path attribute', () => {
      const attrs = parseAttachmentTagAttrs('path="a/b.jpg"')
      expect(attrs).toEqual({ path: 'a/b.jpg' })
    })

    it('parses all CDN attributes', () => {
      const attrs = parseAttachmentTagAttrs(
        'path="x.jpg" url="https://cdn/x.jpg" mediaType="image/jpeg" uploadedAt="2026-04-17T00:00:00Z"',
      )
      expect(attrs).toEqual({
        path: 'x.jpg',
        url: 'https://cdn/x.jpg',
        mediaType: 'image/jpeg',
        uploadedAt: '2026-04-17T00:00:00Z',
      })
    })

    it('is order-insensitive', () => {
      const attrs = parseAttachmentTagAttrs(
        'url="https://cdn/x.jpg" path="x.jpg" mediaType="image/jpeg"',
      )
      expect(attrs?.path).toBe('x.jpg')
      expect(attrs?.url).toBe('https://cdn/x.jpg')
    })

    it('returns null when path is missing', () => {
      expect(parseAttachmentTagAttrs('url="https://cdn/x.jpg"')).toBeNull()
    })

    it('unescapes XML entities', () => {
      const attrs = parseAttachmentTagAttrs('path="a&amp;b&lt;c&gt;.jpg"')
      expect(attrs?.path).toBe('a&b<c>.jpg')
    })
  })

  describe('formatAttachmentTag', () => {
    it('formats plain string (back-compat V1)', () => {
      expect(formatAttachmentTag('foo.jpg')).toBe(
        '<system-tag type="attachment" path="foo.jpg" />',
      )
    })

    it('returns empty for empty path', () => {
      expect(formatAttachmentTag('')).toBe('')
      expect(formatAttachmentTag({ path: '' })).toBe('')
    })

    it('formats full attrs in canonical order', () => {
      const out = formatAttachmentTag({
        path: 'x.jpg',
        url: 'https://cdn/x.jpg',
        mediaType: 'image/jpeg',
        uploadedAt: '2026-04-17T00:00:00Z',
      })
      expect(out).toBe(
        '<system-tag type="attachment" path="x.jpg" url="https://cdn/x.jpg" mediaType="image/jpeg" uploadedAt="2026-04-17T00:00:00Z" />',
      )
    })

    it('omits unset optional attrs', () => {
      const out = formatAttachmentTag({ path: 'x.jpg', url: 'https://cdn/x.jpg' })
      expect(out).toBe('<system-tag type="attachment" path="x.jpg" url="https://cdn/x.jpg" />')
    })

    it('round-trips through parse', () => {
      const attrs = { path: 'chat/ä.png', url: 'https://cdn/x' }
      const tag = formatAttachmentTag(attrs)
      const match = tag.match(/<system-tag\s+type="attachment"\s+([^>]*?)\s*\/>/)
      const parsed = parseAttachmentTagAttrs(match?.[1] ?? '')
      expect(parsed).toEqual(attrs)
    })
  })

  describe('ATTACHMENT_TAG_REGEX', () => {
    it('matches single-attribute tag', () => {
      const text = 'hi <system-tag type="attachment" path="a.jpg" /> bye'
      ATTACHMENT_TAG_REGEX.lastIndex = 0
      const m = ATTACHMENT_TAG_REGEX.exec(text)
      expect(m?.[0]).toBe('<system-tag type="attachment" path="a.jpg" />')
    })

    it('matches multi-attribute tag', () => {
      const text = 'hi <system-tag type="attachment" path="a.jpg" url="https://x" /> bye'
      ATTACHMENT_TAG_REGEX.lastIndex = 0
      const m = ATTACHMENT_TAG_REGEX.exec(text)
      expect(m?.[0]).toBe('<system-tag type="attachment" path="a.jpg" url="https://x" />')
    })

    it('does not match non-attachment system-tag', () => {
      ATTACHMENT_TAG_REGEX.lastIndex = 0
      expect(ATTACHMENT_TAG_REGEX.test('<system-tag type="skill" id="x" />')).toBe(false)
    })
  })

  describe('extractAttachmentTagPath', () => {
    it('returns inner path for single tag', () => {
      expect(
        extractAttachmentTagPath('<system-tag type="attachment" path="a.jpg" />'),
      ).toBe('a.jpg')
    })

    it('returns inner path ignoring CDN attrs', () => {
      expect(
        extractAttachmentTagPath(
          '<system-tag type="attachment" path="a.jpg" url="https://x" mediaType="image/jpeg" />',
        ),
      ).toBe('a.jpg')
    })

    it('returns null for multi-tag text', () => {
      expect(
        extractAttachmentTagPath(
          'prefix <system-tag type="attachment" path="a.jpg" /> suffix',
        ),
      ).toBeNull()
    })
  })

  describe('stripAttachmentTagWrapper', () => {
    it('unwraps to inner path', () => {
      expect(
        stripAttachmentTagWrapper('<system-tag type="attachment" path="a.jpg" />'),
      ).toBe('a.jpg')
    })

    it('passes through plain strings', () => {
      expect(stripAttachmentTagWrapper('foo/bar')).toBe('foo/bar')
    })
  })

  describe('replaceAttachmentTags', () => {
    it('passes attrs to visitor and substitutes return value', () => {
      const text = 'A <system-tag type="attachment" path="a.jpg" /> B'
      const out = replaceAttachmentTags(text, (attrs) => `[${attrs.path}]`)
      expect(out).toBe('A [a.jpg] B')
    })

    it('exposes CDN attrs to visitor', () => {
      const text = '<system-tag type="attachment" path="a.jpg" url="https://cdn/x" />'
      const out = replaceAttachmentTags(text, (attrs) => attrs.url ?? 'NO_URL')
      expect(out).toBe('https://cdn/x')
    })
  })

  describe('hasAttachmentTag', () => {
    it('detects V1 format', () => {
      expect(hasAttachmentTag('x <system-tag type="attachment" path="a.jpg" /> y')).toBe(true)
    })

    it('detects V2 format with extra attrs', () => {
      expect(
        hasAttachmentTag('<system-tag type="attachment" path="a.jpg" url="x" />'),
      ).toBe(true)
    })

    it('returns false for plain text', () => {
      expect(hasAttachmentTag('no tag here')).toBe(false)
    })
  })
})
