/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  ATTACHMENT_TAG_REGEX,
  replaceAttachmentTags,
  stripAttachmentTagWrapper,
} from "@openloaf/api/common";

/** Skill reference matcher: /skill/[originalName|displayName] or /skill/[originalName] or /skill/name */
const SKILL_REF_REGEX =
  /\/skill\/\[([\w-]+)(?:\|([^\]]*))?\]|\/skill\/([\w-]+)/g;

/** Bare absolute file path (Unix-style). */
const BARE_PATH_REGEX = /(?:^|\s)(\/(?:[\w._-]+\/)+[\w._-]+)/g;

/** Extract a readable file label from a token value. */
function extractFileLabel(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return token;
  const normalized = stripAttachmentTagWrapper(trimmed);
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  const scopedMatch = baseValue.match(/^\[([^\]]+)\]\/(.+)$/);
  const rawPath = scopedMatch ? scopedMatch[2] ?? "" : baseValue;
  const cleaned = rawPath.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  const parts = cleaned.split("/");
  const label = parts[parts.length - 1] || cleaned;
  return label || baseValue;
}

/** Replace attachment tags with file names. */
export function replaceFileTokensWithNames(text: string): string {
  if (!text) return text;
  ATTACHMENT_TAG_REGEX.lastIndex = 0;
  if (!ATTACHMENT_TAG_REGEX.test(text)) return text;
  ATTACHMENT_TAG_REGEX.lastIndex = 0;
  return replaceAttachmentTags(text, (attrs, rawTag) => {
    // 中文注释：将文件引用替换为文件名，避免标题过长。
    const label = extractFileLabel(attrs.path);
    return label || rawTag;
  });
}

/** Replace skill references with display names for title use. */
export function replaceSkillRefsWithNames(text: string): string {
  if (!text || !text.includes("/skill/")) return text;
  SKILL_REF_REGEX.lastIndex = 0;
  return text.replace(SKILL_REF_REGEX, (_raw, origName, displayName, legacyName) => {
    return displayName || origName || legacyName || "";
  });
}

/** Replace bare absolute file paths with their basename. */
export function replaceBarePathsWithNames(text: string): string {
  if (!text || !text.includes("/")) return text;
  BARE_PATH_REGEX.lastIndex = 0;
  return text.replace(BARE_PATH_REGEX, (match, fullPath) => {
    const parts = fullPath.split("/");
    const basename = parts[parts.length - 1] || fullPath;
    // 保留前面的空格（如果有的话）
    const prefix = match.startsWith(" ") ? " " : "";
    return prefix + basename;
  });
}
