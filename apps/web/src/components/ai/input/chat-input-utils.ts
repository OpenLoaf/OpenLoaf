/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import {
  ATTACHMENT_TAG_REGEX,
  extractAttachmentTagPath,
  replaceAttachmentTags,
  SKILL_COMMAND_PREFIX,
} from "@openloaf/api/common";
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";

// 逻辑：文件引用统一序列化为 <system-tag type="attachment" path="..." />，
// 与 server 注入的 <system-tag> 上下文块视觉对齐，便于模型识别。
export const FILE_TOKEN_REGEX = ATTACHMENT_TAG_REGEX;

export const MAX_CHARS = 20000;
export const ONLINE_SEARCH_GLOBAL_STORAGE_KEY = "openloaf:chat-online-search:global-enabled";
export const CHAT_MODE_STORAGE_KEY = "openloaf:chat-mode";

/** Convert serialized chat text into a plain-text string for character counting. */
export function getPlainTextFromInput(value: string): string {
  if (!value) return "";
  return replaceAttachmentTags(value, (attrs) => getFileLabel(attrs.path));
}

/** Normalize mention value by trimming the attachment tag wrapper if present. */
const normalizeMentionValue = (value: string) => {
  const inner = extractAttachmentTagPath(value);
  return inner !== null ? inner : value.trim();
};

/** Normalize spacing around file mention tokens. */
export const normalizeFileMentionSpacing = (value: string) => {
  ATTACHMENT_TAG_REGEX.lastIndex = 0;
  if (!ATTACHMENT_TAG_REGEX.test(value)) return value;
  ATTACHMENT_TAG_REGEX.lastIndex = 0;
  const tokenPattern = /<system-tag\s+type="attachment"\s+path="[^"]*"\s*\/>/g;
  const withLeadingSpace = value.replace(
    new RegExp(`(\\S)(${tokenPattern.source})`, "g"),
    (_match, lead, token) => `${lead} ${token}`,
  );
  return withLeadingSpace.replace(
    new RegExp(`(${tokenPattern.source})(?=\\S)`, "g"),
    (_match, token) => `${token} `,
  );
};

/** Build skill command text for chat input.
 *  When displayName differs from originalName, produces `/skill/[originalName|displayName]`.
 *  Otherwise produces `/skill/[originalName]`.
 */
export const buildSkillCommandText = (originalName: string, displayName?: string) => {
  const trimmed = originalName.trim();
  if (!trimmed) return "";
  if (displayName && displayName.trim() !== trimmed) {
    return `${SKILL_COMMAND_PREFIX}[${trimmed}|${displayName.trim()}]`;
  }
  return `${SKILL_COMMAND_PREFIX}[${trimmed}]`;
};

/** Append text to chat input with proper spacing. */
export const appendChatInputText = (current: string, insert: string) => {
  const trimmedInsert = insert.trim();
  if (!trimmedInsert) return current;
  const needsLeadingSpace = current.length > 0 && !/\s$/.test(current);
  const base = `${current}${needsLeadingSpace ? " " : ""}${trimmedInsert}`;
  return /\s$/.test(base) ? base : `${base} `;
};

/** Get the visible label for a file reference. */
export const getFileLabel = (value: string) => {
  const normalized = normalizeMentionValue(value);
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  const lineStart = match?.[2];
  const lineEnd = match?.[3];
  const parsed = parseScopedProjectPath(baseValue);
  const labelBase = parsed?.relativePath ?? baseValue;
  const parts = labelBase.split("/");
  const label = parts[parts.length - 1] || labelBase;
  return lineStart && lineEnd ? `${label} ${lineStart}:${lineEnd}` : label;
};
