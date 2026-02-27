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

import { SKILL_COMMAND_PREFIX } from "@openloaf/api/common";
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";

// 逻辑：允许非 URL 编码的路径，使用非空白字符匹配文件引用。
const FILE_TOKEN_BODY = "(?:\\[[^\\]]+\\]/\\S+|[^\\s@]+/\\S+)(?::\\d+-\\d+)?";
export const FILE_TOKEN_REGEX = new RegExp(`@(${FILE_TOKEN_BODY})`, "g");

/** Normalize mention value by trimming leading "@". */
const normalizeMentionValue = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
};

/** Normalize spacing around file mention tokens. */
export const normalizeFileMentionSpacing = (value: string) => {
  FILE_TOKEN_REGEX.lastIndex = 0;
  if (!FILE_TOKEN_REGEX.test(value)) return value;
  const withLeadingSpace = value.replace(
    new RegExp(`(\\\\S)(@${FILE_TOKEN_BODY})`, "g"),
    (_match, lead, token) => `${lead} ${token}`,
  );
  return withLeadingSpace.replace(
    new RegExp(`(@${FILE_TOKEN_BODY})(?=\\\\S)`, "g"),
    (_match, token) => `${token} `,
  );
};

/** Build skill command text for chat input. */
export const buildSkillCommandText = (skillName: string) => {
  const trimmed = skillName.trim();
  return trimmed ? `${SKILL_COMMAND_PREFIX}${trimmed}` : "";
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
