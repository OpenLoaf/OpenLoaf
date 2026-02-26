/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { FILE_TOKEN_REGEX } from "../input/chat-input-utils";

const COMMAND_REGEX = /(^|\s)(\/[\w-]+)(?![/\w-])/g;

export type ChatTextToken =
  | { type: "text"; value: string }
  | { type: "command"; value: string }
  | { type: "mention"; value: string };

/** Normalize URL boundary in CJK text to avoid malformed auto-links. */
export function preprocessChatText(value: string): string {
  if (!value) return value;
  return value.replace(
    /(https?:\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)([\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef])/g,
    "$1 $2",
  );
}

/** Split plain text into normal and command segments. */
function splitCommandSegments(value: string): ChatTextToken[] {
  if (!value) return [];
  const result: ChatTextToken[] = [];
  COMMAND_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match = COMMAND_REGEX.exec(value);
  while (match) {
    if (match.index > lastIndex) {
      result.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    const lead = match[1] ?? "";
    const command = match[2] ?? "";
    if (lead) {
      result.push({ type: "text", value: lead });
    }
    if (command) {
      result.push({ type: "command", value: command });
    }
    lastIndex = match.index + match[0].length;
    match = COMMAND_REGEX.exec(value);
  }
  if (lastIndex < value.length) {
    result.push({ type: "text", value: value.slice(lastIndex) });
  }
  return result;
}

/** Split message text into mention / command / plain segments. */
export function parseChatTextTokens(value: string): ChatTextToken[] {
  const result: ChatTextToken[] = [];
  let lastIndex = 0;
  FILE_TOKEN_REGEX.lastIndex = 0;
  let match = FILE_TOKEN_REGEX.exec(value);
  while (match) {
    const mentionValue = match[1] ?? "";
    if (match.index > lastIndex) {
      result.push(...splitCommandSegments(value.slice(lastIndex, match.index)));
    }
    if (mentionValue) {
      result.push({ type: "mention", value: mentionValue });
    } else {
      result.push(...splitCommandSegments(match[0] ?? ""));
    }
    lastIndex = match.index + match[0].length;
    match = FILE_TOKEN_REGEX.exec(value);
  }
  if (lastIndex < value.length) {
    result.push(...splitCommandSegments(value.slice(lastIndex)));
  }
  if (result.length === 0) {
    result.push({ type: "text", value });
  }
  return result;
}

