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

import { FILE_TOKEN_REGEX } from "../input/chat-input-utils";

const COMMAND_REGEX = /(^|\s)(\/[\w-]+)(?![/\w-])/g;
const SKILL_REGEX = /\/skill\/([\w-]+)(?=\s|[^\x00-\x7F]|$)/g;

export type ChatTextToken =
  | { type: "text"; value: string }
  | { type: "command"; value: string }
  | { type: "mention"; value: string }
  | { type: "skill"; value: string };

/** Normalize URL boundary in CJK text to avoid malformed auto-links. */
export function preprocessChatText(value: string): string {
  if (!value) return value;
  return value.replace(
    /(https?:\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)([\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef])/g,
    "$1 $2",
  );
}

/** Split plain text into skill / command / text segments. */
function splitCommandSegments(value: string): ChatTextToken[] {
  if (!value) return [];
  // First pass: extract /skill/xxx tokens.
  const afterSkill: ChatTextToken[] = [];
  SKILL_REGEX.lastIndex = 0;
  let skillLastIndex = 0;
  let skillMatch = SKILL_REGEX.exec(value);
  while (skillMatch) {
    if (skillMatch.index > skillLastIndex) {
      afterSkill.push({ type: "text", value: value.slice(skillLastIndex, skillMatch.index) });
    }
    afterSkill.push({ type: "skill", value: skillMatch[1] ?? "" });
    skillLastIndex = skillMatch.index + skillMatch[0].length;
    skillMatch = SKILL_REGEX.exec(value);
  }
  if (skillLastIndex < value.length) {
    afterSkill.push({ type: "text", value: value.slice(skillLastIndex) });
  }
  if (afterSkill.length === 0) {
    afterSkill.push({ type: "text", value });
  }

  // Second pass: split remaining text segments for /command tokens.
  const result: ChatTextToken[] = [];
  for (const seg of afterSkill) {
    if (seg.type !== "text") {
      result.push(seg);
      continue;
    }
    COMMAND_REGEX.lastIndex = 0;
    let lastIndex = 0;
    let match = COMMAND_REGEX.exec(seg.value);
    if (!match) {
      result.push(seg);
      continue;
    }
    while (match) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: seg.value.slice(lastIndex, match.index) });
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
      match = COMMAND_REGEX.exec(seg.value);
    }
    if (lastIndex < seg.value.length) {
      result.push({ type: "text", value: seg.value.slice(lastIndex) });
    }
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

