/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** File token matcher for file placeholders. */
// 逻辑：匹配形如 @path/to/file 或 @[projectId]/path/to/file。
const FILE_TOKEN_REGEX = /@(\[[^\]]+\]\/\S+|\S+\/\S+)/g;

/** Extract a readable file label from a token value. */
function extractFileLabel(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return token;
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  const scopedMatch = baseValue.match(/^\[([^\]]+)\]\/(.+)$/);
  const rawPath = scopedMatch ? scopedMatch[2] ?? "" : baseValue;
  const cleaned = rawPath.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  const parts = cleaned.split("/");
  const label = parts[parts.length - 1] || cleaned;
  return label || baseValue;
}

/** Replace file reference tokens with file names. */
export function replaceFileTokensWithNames(text: string): string {
  if (!text) return text;
  if (!text.includes("@")) return text;
  FILE_TOKEN_REGEX.lastIndex = 0;
  if (!FILE_TOKEN_REGEX.test(text)) return text;
  return text.replace(FILE_TOKEN_REGEX, (raw, token) => {
    // 中文注释：将文件引用替换为文件名，避免标题过长。
    const label = extractFileLabel(String(token ?? raw ?? ""));
    return label || raw;
  });
}
