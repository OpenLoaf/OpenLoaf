/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";

const APPROX_BYTES_PER_TOKEN = 4;
const DEFAULT_MAX_OUTPUT_TOKENS = 10_000;

/** Build environment variables for exec tools. */
export function buildExecEnv(input: { tty?: boolean }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (input.tty && !env.TERM) env.TERM = "xterm-256color";
  const pathEntries = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const ensurePath = (entry: string) => {
    if (!pathEntries.includes(entry)) pathEntries.push(entry);
  };
  // 中文注释：补齐常见 PATH，避免 GUI 进程缺失路径导致 spawn 失败。
  ensurePath("/usr/bin");
  ensurePath("/bin");
  ensurePath("/usr/sbin");
  ensurePath("/sbin");
  if (process.platform === "darwin") {
    ensurePath("/usr/local/bin");
    ensurePath("/opt/homebrew/bin");
  }
  if (process.platform === "win32") {
    // 中文注释：Windows GUI 进程继承的 PATH 可能缺失系统目录，显式补齐。
    ensurePath("C:\\Windows\\System32");
    ensurePath("C:\\Windows");
    ensurePath("C:\\Windows\\System32\\WindowsPowerShell\\v1.0");
    ensurePath("C:\\Program Files\\PowerShell\\7");
  }
  env.PATH = pathEntries.join(path.delimiter);
  return env;
}

type TruncationPolicy = {
  kind: "tokens" | "chars";
  limit: number;
};

type TruncationResult = {
  text: string;
  totalLines: number;
  truncatedLines: number;
  truncated: boolean;
};

/** Approximate token count for text. */
function approxTokenCount(text: string): number {
  const bytes = Buffer.byteLength(text);
  return Math.ceil(bytes / APPROX_BYTES_PER_TOKEN);
}

/** Approximate byte budget for tokens. */
function approxBytesForTokens(tokens: number): number {
  return tokens * APPROX_BYTES_PER_TOKEN;
}

/** Count lines in a string following Rust's lines() behavior. */
function countLines(text: string): number {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") count += 1;
  }
  if (text.endsWith("\n")) count -= 1;
  return count;
}

/** Format truncation marker. */
function formatTruncationMarker(policy: TruncationPolicy, removedUnits: number): string {
  if (policy.kind === "tokens") return `…${removedUnits} tokens truncated…`;
  return `…${removedUnits} chars truncated…`;
}

/** Adjust a byte index to the previous UTF-8 boundary. */
function clampUtf8End(buffer: Buffer, index: number): number {
  let cursor = Math.max(0, Math.min(index, buffer.length));
  while (cursor > 0) {
    const byte = buffer[cursor - 1];
    if (byte === undefined) break;
    if ((byte & 0b1100_0000) !== 0b1000_0000) break;
    cursor -= 1;
  }
  return cursor;
}

/** Adjust a byte index to the next UTF-8 boundary. */
function clampUtf8Start(buffer: Buffer, index: number): number {
  let cursor = Math.max(0, Math.min(index, buffer.length));
  while (cursor < buffer.length) {
    const byte = buffer[cursor];
    if (byte === undefined) break;
    if ((byte & 0b1100_0000) !== 0b1000_0000) break;
    cursor += 1;
  }
  return cursor;
}

/** Truncate text in the middle with a marker. */
function truncateText(content: string, policy: TruncationPolicy): TruncationResult {
  const totalLines = countLines(content);
  if (!content) {
    return { text: "", totalLines, truncatedLines: 0, truncated: false };
  }

  const maxBytes = policy.kind === "tokens" ? approxBytesForTokens(policy.limit) : policy.limit;
  const bytes = Buffer.from(content, "utf8");
  if (bytes.length <= maxBytes) {
    return {
      text: content,
      totalLines,
      truncatedLines: totalLines,
      truncated: false,
    };
  }

  if (maxBytes <= 0) {
    const removedUnits =
      policy.kind === "tokens" ? approxTokenCount(content) : Array.from(content).length;
    const marker = formatTruncationMarker(policy, removedUnits);
    return {
      text: marker,
      totalLines,
      truncatedLines: countLines(marker),
      truncated: true,
    };
  }

  const leftBudget = Math.floor(maxBytes / 2);
  const rightBudget = maxBytes - leftBudget;
  const prefixEnd = clampUtf8End(bytes, leftBudget);
  const suffixStart = clampUtf8Start(bytes, bytes.length - rightBudget);
  const prefix = bytes.toString("utf8", 0, prefixEnd);
  const suffix = bytes.toString("utf8", suffixStart);
  const totalChars = Array.from(content).length;
  const keptChars = Array.from(prefix).length + Array.from(suffix).length;
  const removedChars = Math.max(0, totalChars - keptChars);
  const removedUnits =
    policy.kind === "tokens"
      ? Math.ceil((bytes.length - maxBytes) / APPROX_BYTES_PER_TOKEN)
      : removedChars;
  const marker = formatTruncationMarker(policy, removedUnits);
  const text = `${prefix}${marker}${suffix}`;
  return {
    text,
    totalLines,
    truncatedLines: countLines(text),
    truncated: true,
  };
}

/** Format truncation for freeform outputs. */
export function formatFreeformOutput(
  content: string,
  maxTokens = DEFAULT_MAX_OUTPUT_TOKENS,
): TruncationResult {
  return truncateText(content, { kind: "tokens", limit: maxTokens });
}
