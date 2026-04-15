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
 * Chat input serializes dropped files / file mentions as a self-closing XML
 * tag so it visually aligns with the `<system-tag type="...">` blocks injected
 * by the server preface. The path attribute may embed optional line ranges
 * as a `:start-end` suffix to match historical semantics.
 *
 *   <system-tag type="attachment" path="${CURRENT_CHAT_DIR}/foo.jpg" />
 *   <system-tag type="attachment" path="[proj_xxx]/src/foo.ts:10-20" />
 */

/** Global regex matching any attachment tag. Capture group 1 is the raw path attribute. */
export const ATTACHMENT_TAG_REGEX =
  /<system-tag\s+type="attachment"\s+path="([^"]*)"\s*\/>/g;

/** Strict regex matching a string that is *exactly* a single attachment tag. */
const ATTACHMENT_TAG_EXACT_REGEX =
  /^<system-tag\s+type="attachment"\s+path="([^"]*)"\s*\/>$/;

/** Escape a path value for use inside the double-quoted `path` attribute. */
export function escapeAttachmentPath(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Reverse of escapeAttachmentPath. */
export function unescapeAttachmentPath(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Format a path into the attachment tag string. Returns empty string for empty path. */
export function formatAttachmentTag(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  return `<system-tag type="attachment" path="${escapeAttachmentPath(trimmed)}" />`;
}

/**
 * If the given value is exactly a single attachment tag, return the inner path
 * (unescaped). Otherwise return null.
 */
export function extractAttachmentTagPath(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(ATTACHMENT_TAG_EXACT_REGEX);
  if (!match) return null;
  return unescapeAttachmentPath(match[1] ?? "");
}

/**
 * Strip an attachment tag wrapper if present, returning just the inner path.
 * Leaves non-tag inputs untouched (trimmed). Used by server tools that accept
 * either a raw path or a tag-wrapped one as input.
 */
export function stripAttachmentTagWrapper(value: string): string {
  const inner = extractAttachmentTagPath(value);
  if (inner !== null) return inner;
  return value.trim();
}

/** Check whether the value contains at least one attachment tag. */
export function hasAttachmentTag(value: string): boolean {
  ATTACHMENT_TAG_REGEX.lastIndex = 0;
  const result = ATTACHMENT_TAG_REGEX.test(value);
  ATTACHMENT_TAG_REGEX.lastIndex = 0;
  return result;
}

/** Replace each attachment tag in the text with the provided visitor's return value. */
export function replaceAttachmentTags(
  text: string,
  visitor: (rawPath: string, rawTag: string) => string,
): string {
  ATTACHMENT_TAG_REGEX.lastIndex = 0;
  return text.replace(ATTACHMENT_TAG_REGEX, (rawTag, rawPath: string) =>
    visitor(unescapeAttachmentPath(rawPath ?? ""), rawTag),
  );
}
