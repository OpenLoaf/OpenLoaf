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

import { isToolPart } from "./message-parts";
import { resolveToolDisplayName } from "./tool-name";
import { normalizeFileMentionSpacing } from "@/components/ai/input/chat-input-utils";

type AnyMessagePart = {
  type?: string;
  text?: string;
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  data?: { reason?: string };
};

/**
 * Extracts the plain text from UIMessage.parts for copy/edit scenarios.
 */
export function getMessagePlainText(message: { parts?: unknown[] } | undefined): string {
  const parts = Array.isArray(message?.parts) ? (message!.parts as AnyMessagePart[]) : [];
  const text = parts
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
  return normalizeFileMentionSpacing(text);
}

/**
 * Extracts the full text content including tool calls from UIMessage.parts.
 */
export function getMessageTextWithToolCalls(message: { parts?: unknown[] } | undefined): string {
  const parts = Array.isArray(message?.parts) ? (message!.parts as AnyMessagePart[]) : [];
  const chunks: string[] = [];

  // 关键：按 parts 原始顺序拼接，保证文本与工具调用的顺序一致。
  for (const part of parts) {
    if (part?.type === "text" && typeof part?.text === "string") {
      const text = String(part.text);
      if (text.trim()) chunks.push(text);
      continue;
    }

    if (isToolPart(part)) {
      const text = getToolCopyText(part);
      if (text) chunks.push(text);
    }
  }

  const text = chunks.join("\n\n").trim();
  return normalizeFileMentionSpacing(text);
}

/**
 * Normalizes tool input values for copy output.
 */
function safeStringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Determines whether tool input should be treated as empty.
 */
function isEmptyInput(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Builds the copy payload for a tool part.
 */
function getToolCopyText(part: AnyMessagePart): string {
  const toolName = resolveToolDisplayName({
    title: part.title,
    toolName: part.toolName,
    type: typeof part.type === "string" ? part.type : undefined,
  });
  const showInput = !isEmptyInput(part.input);
  const inputText = safeStringify(part.input);
  const outputText = safeStringify(part.output);
  const hasErrorText = typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const outputDisplayText =
    outputText ||
    (hasErrorText
      ? `（错误：${part.errorText}）`
      : part.state && part.state !== "output-available"
        ? `（${part.state}）`
        : "（暂无返回结果）");

  return [
    `工具：${toolName}`,
    `输入参数\n${showInput ? inputText : "（无）"}`,
    `输出结果\n${outputDisplayText}`,
  ].join("\n");
}
