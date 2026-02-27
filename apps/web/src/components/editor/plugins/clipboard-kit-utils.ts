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

import { FILE_TOKEN_REGEX, normalizeFileMentionSpacing } from "@/components/ai/input/chat-input-utils";

type InlineTextNode = { text: string };
type MentionNode = { type: "mention"; value: string; children: InlineTextNode[] };
type PlateNode = { type?: string; children?: any[]; [key: string]: any };

/** Normalize mention value by trimming leading "@". */
const normalizeMentionValue = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
};

/** Build a mention node for file references. */
export const buildMentionNode = (value: string): MentionNode => ({
  type: "mention",
  value: normalizeMentionValue(value),
  children: [{ text: "" }],
});

/** Build inline nodes from text that may contain file tokens. */
export const buildInlineNodesFromText = (text: string) => {
  const nodes: Array<MentionNode | InlineTextNode> = [];
  let lastIndex = 0;
  FILE_TOKEN_REGEX.lastIndex = 0;
  let match = FILE_TOKEN_REGEX.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      nodes.push({ text: text.slice(lastIndex, match.index) });
    }
    const tokenValue = normalizeMentionValue(match[1] ?? "");
    if (tokenValue) {
      nodes.push(buildMentionNode(tokenValue));
      const nextChar = text[match.index + match[0].length];
      if (nextChar && !/\\s/.test(nextChar)) {
        // 中文注释：文件引用后若紧跟文本，自动插入空格便于阅读。
        nodes.push({ text: " " });
      }
    } else {
      nodes.push({ text: match[0] });
    }
    lastIndex = match.index + match[0].length;
    match = FILE_TOKEN_REGEX.exec(text);
  }
  if (lastIndex < text.length) {
    nodes.push({ text: text.slice(lastIndex) });
  }
  if (nodes.length === 0) {
    nodes.push({ text: "" });
  }
  return nodes;
};

/** Serialize Plate children into stored text. */
const serializeChildren = (nodes: any[]): string =>
  nodes
    .map((node) => {
      if (node?.type === "mention") {
        const value = normalizeMentionValue(String(node.value ?? ""));
        return value ? `@${value}` : "";
      }
      if (typeof node?.text === "string") {
        return node.text;
      }
      if (Array.isArray(node?.children)) {
        return serializeChildren(node.children);
      }
      return "";
    })
    .join("");

/** Serialize Plate fragment/value into stored text. */
export const serializeChatValue = (value: PlateNode[] | unknown): string => {
  const lines = (Array.isArray(value) ? value : []).map((node: any) =>
    serializeChildren(node?.children ?? [])
  );
  const normalized: string[] = [];
  for (const line of lines) {
    const isEmpty = line.trim().length === 0;
    if (isEmpty) {
      if (normalized.length === 0) continue;
      if (normalized[normalized.length - 1] === "") continue;
      normalized.push("");
    } else {
      normalized.push(line);
    }
  }
  while (normalized.length > 0 && normalized[normalized.length - 1] === "") {
    normalized.pop();
  }
  return normalizeFileMentionSpacing(normalized.join("\n"));
};

/** Normalize serialized text for clipboard usage. */
export const normalizeSerializedForClipboard = (value: string) =>
  normalizeFileMentionSpacing(value);
