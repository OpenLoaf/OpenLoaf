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

type AnyPart = {
  type?: unknown;
  toolName?: unknown;
  state?: unknown;
  errorText?: unknown;
};

const HIDDEN_TOOL_NAMES = new Set(["tool-search"]);

/** Resolve normalized tool name from a message part. */
function resolveToolName(part: AnyPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName.trim();
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length).trim();
  }
  return "";
}

/** 判断一个 part 是否是 tool part（用于 UI 渲染工具卡片）。 */
export function isToolPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as AnyPart;
  if (resolveToolName(p)) return true;
  if (typeof p.type !== "string") return false;
  const type = p.type.trim();
  return type === "dynamic-tool";
}

/** 判断一个 tool part 是否有错误状态（错误的工具调用不应被隐藏）。 */
export function isToolPartError(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as AnyPart;
  if (p.state === "output-error") return true;
  if (typeof p.errorText === "string" && p.errorText.trim().length > 0) return true;
  return false;
}

/** 判断一个 tool part 是否应在 Web 聊天中隐藏。 */
export function isHiddenToolPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const toolName = resolveToolName(part as AnyPart).toLowerCase();
  if (!toolName) return false;
  return HIDDEN_TOOL_NAMES.has(toolName);
}
