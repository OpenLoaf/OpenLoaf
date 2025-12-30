"use client";

import type { Value } from "platejs";
import { KEYS } from "platejs";

export const FILE_TOKEN_REGEX = /@\\{([^}]+)\\}/g;

export type MentionNode = {
  type: typeof KEYS.mention;
  value: string;
  children: [{ text: "" }];
};

/** Build a mention node for file references. */
export const buildMentionNode = (value: string): MentionNode => ({
  type: KEYS.mention,
  value,
  children: [{ text: "" }],
});

/** Get the visible label for a file reference. */
export const getFileLabel = (value: string) => {
  const parts = value.split("/");
  return parts[parts.length - 1] || value;
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
    const tokenValue = match[1]?.trim();
    if (tokenValue) {
      nodes.push(buildMentionNode(tokenValue));
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
        return `@{${node.value ?? ""}}`;
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
  return normalized.join("\n");
};

/** Normalize serialized text for clipboard usage. */
export const normalizeSerializedForClipboard = (value: string) =>
  value.replace(/\\s*@\\{([^}]+)\\}\\s*/g, (_match, token) => `@{${token}}`);

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
