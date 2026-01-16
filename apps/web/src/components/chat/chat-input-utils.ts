"use client";

import type { Value } from "platejs";
import { KEYS } from "platejs";
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

export type MentionNode = {
  type: typeof KEYS.mention;
  value: string;
  children: [{ text: "" }];
};

/** Build a mention node for file references. */
export const buildMentionNode = (value: string): MentionNode => ({
  type: KEYS.mention,
  value: normalizeMentionValue(value),
  children: [{ text: "" }],
});

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

/** Parse serialized chat input into Plate value. */
export const parseChatValue = (text: string): Value => {
  const lines = text.split("\n");
  return lines.map((line) => ({
    type: KEYS.p,
    children: buildInlineNodesFromText(line),
  }));
};

/** Build inline nodes from text that may contain file tokens. */
export const buildInlineNodesFromText = (text: string) => {
  const nodes: Array<MentionNode | { text: string }> = [];
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
      if (nextChar && !/\s/.test(nextChar)) {
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
      if (node?.type === KEYS.mention) {
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

/** Serialize Plate value into stored text. */
export const serializeChatValue = (value: Value): string => {
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

/** Build plain text for character counting. */
export const getPlainTextValue = (value: Value): string =>
  (Array.isArray(value) ? value : [])
    .map((node: any) =>
      (node?.children ?? [])
        .map((child: any) => {
          if (child?.type === KEYS.mention) {
            return getFileLabel(child.value ?? "");
          }
          if (typeof child?.text === "string") {
            return child.text;
          }
          if (Array.isArray(child?.children)) {
            return getPlainTextValue(child.children);
          }
          return "";
        })
        .join("")
    )
    .join("\\n");
