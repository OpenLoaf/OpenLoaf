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
 * Shared helpers for the chat attachment tag format.
 *
 * Attachment tags carry a local path reference plus optional CDN metadata
 * populated by the server after a successful upload. The CDN fields let
 * repeated sends (including model switches) reuse the same public URL
 * without re-uploading, as long as the signed URL is still fresh.
 *
 *   <system-tag type="attachment" path="${CURRENT_CHAT_DIR}/foo.jpg" />
 *   <system-tag type="attachment" path="[proj_xxx]/src/foo.ts:10-20" />
 *   <system-tag
 *     type="attachment"
 *     path="${CURRENT_CHAT_DIR}/foo.jpg"
 *     url="https://cdn.saas.com/abc.jpg"
 *     mediaType="image/jpeg"
 *     uploadedAt="2026-04-17T10:00:00Z"
 *   />
 */

/** All optional attributes that an attachment tag may carry. */
export type AttachmentTagAttrs = {
  /** Local / project-scoped path. Always present. */
  path: string
  /** Public CDN URL (valid within TTL). */
  url?: string
  /** MIME type resolved by upload step. */
  mediaType?: string
  /** ISO timestamp of last successful upload; used to judge TTL freshness. */
  uploadedAt?: string
}

/**
 * V2 regex — matches the whole tag and captures its raw inner attribute
 * string. Use `parseAttachmentTagAttrs` to decode the inner string.
 */
export const ATTACHMENT_TAG_REGEX = /<system-tag\s+type="attachment"\s+([^>]*?)\s*\/>/g

/**
 * Legacy regex that captured only the `path` attribute. Kept here so
 * downstream callers can import it for quick existence checks, but new code
 * should prefer `ATTACHMENT_TAG_REGEX` + `parseAttachmentTagAttrs`.
 */
export const ATTACHMENT_TAG_PATH_REGEX =
  /<system-tag\s+type="attachment"\s+path="([^"]*)"\s*\/>/g

const ATTACHMENT_TAG_EXACT_REGEX =
  /^<system-tag\s+type="attachment"\s+([^>]*?)\s*\/>$/

/** Escape an attribute value for use inside a double-quoted XML attribute. */
export function escapeAttachmentPath(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Reverse of escapeAttachmentPath. */
export function unescapeAttachmentPath(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Parse a raw attribute string (contents between `type="attachment"` and `/>`). */
export function parseAttachmentTagAttrs(rawAttrs: string): AttachmentTagAttrs | null {
  const attrs: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration idiom
  while ((m = re.exec(rawAttrs)) !== null) {
    attrs[m[1]!] = unescapeAttachmentPath(m[2] ?? '')
  }
  const path = attrs.path?.trim()
  if (!path) return null
  const out: AttachmentTagAttrs = { path }
  if (attrs.url) out.url = attrs.url
  if (attrs.mediaType) out.mediaType = attrs.mediaType
  if (attrs.uploadedAt) out.uploadedAt = attrs.uploadedAt
  return out
}

/** Format a set of attrs into the full attachment tag string. */
export function formatAttachmentTag(input: string | AttachmentTagAttrs): string {
  // Back-compat: plain path string.
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return ''
    return `<system-tag type="attachment" path="${escapeAttachmentPath(trimmed)}" />`
  }
  const path = input.path.trim()
  if (!path) return ''
  const parts = [`<system-tag type="attachment" path="${escapeAttachmentPath(path)}"`]
  if (input.url) parts.push(`url="${escapeAttachmentPath(input.url)}"`)
  if (input.mediaType) parts.push(`mediaType="${escapeAttachmentPath(input.mediaType)}"`)
  if (input.uploadedAt) parts.push(`uploadedAt="${escapeAttachmentPath(input.uploadedAt)}"`)
  return `${parts.join(' ')} />`
}

/**
 * If the given value is exactly a single attachment tag, return the inner
 * path (unescaped). Drops any CDN attributes. Returns null otherwise.
 */
export function extractAttachmentTagPath(value: string): string | null {
  const trimmed = value.trim()
  const match = trimmed.match(ATTACHMENT_TAG_EXACT_REGEX)
  if (!match) return null
  const attrs = parseAttachmentTagAttrs(match[1] ?? '')
  return attrs?.path ?? null
}

/**
 * Strip an attachment tag wrapper if present, returning just the inner path.
 * Leaves non-tag inputs untouched (trimmed).
 */
export function stripAttachmentTagWrapper(value: string): string {
  const inner = extractAttachmentTagPath(value)
  if (inner !== null) return inner
  return value.trim()
}

/** Check whether the value contains at least one attachment tag. */
export function hasAttachmentTag(value: string): boolean {
  ATTACHMENT_TAG_REGEX.lastIndex = 0
  const result = ATTACHMENT_TAG_REGEX.test(value)
  ATTACHMENT_TAG_REGEX.lastIndex = 0
  return result
}

/**
 * Replace each attachment tag in the text with the visitor's return value.
 * The visitor receives the fully parsed attrs and the original tag string.
 */
export function replaceAttachmentTags(
  text: string,
  visitor: (attrs: AttachmentTagAttrs, rawTag: string) => string,
): string {
  ATTACHMENT_TAG_REGEX.lastIndex = 0
  return text.replace(ATTACHMENT_TAG_REGEX, (rawTag, rawAttrs: string) => {
    const attrs = parseAttachmentTagAttrs(rawAttrs ?? '')
    if (!attrs) return rawTag
    return visitor(attrs, rawTag)
  })
}
