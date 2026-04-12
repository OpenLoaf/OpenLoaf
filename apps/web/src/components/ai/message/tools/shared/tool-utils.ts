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

import { resolveToolDisplayName } from "@/lib/chat/tool-name";

export type ToolVariant = "default" | "nested";

export type AnyToolPart = {
  /** Tool part type, e.g. tool-xxx or dynamic-tool. */
  type: string;
  /** Tool call id for state lookup. */
  toolCallId?: string;
  /** Tool name for display. */
  toolName?: string;
  /** Tool title for display. */
  title?: string;
  /** Tool state. */
  state?: string;
  /** Tool input payload. */
  input?: unknown;
  /** Raw input payload when input is not yet parsed. */
  rawInput?: unknown;
  /** Tool output payload. */
  output?: unknown;
  /** Tool error text. */
  errorText?: string | null;
  /** Tool approval status. */
  approval?: { id?: string; approved?: boolean; reason?: string };
  /** Rendering variant for specialized tool UI. */
  variant?: string;
  /** Whether the tool was executed by the CLI provider (e.g. Claude Code). */
  providerExecuted?: boolean;
  /** Media generation state for image-generate / video-generate tools. */
  mediaGenerate?: {
    status: "generating" | "done" | "error";
    kind?: "image" | "video";
    prompt?: string;
    progress?: number;
    urls?: string[];
    errorCode?: string;
  };
  /** Tool progress streaming state (generic, any tool). */
  toolProgress?: {
    status: "active" | "done" | "error";
    label?: string;
    summary?: string;
    errorText?: string;
    accumulatedText: string;
    meta?: Record<string, unknown>;
  };
};

export type ToolOutputState = {
  /** Raw output text from tool. */
  outputText: string;
  /** Whether the tool has error text. */
  hasErrorText: boolean;
  /** Display text for empty output or pending state. */
  displayText: string;
};

/** Resolve tool display name. */
export function getToolName(part: AnyToolPart): string {
  const inputPayload = normalizeToolInput(part.input);
  const inputObject = asPlainObject(inputPayload);
  // Legacy: actionName 仅用于兼容历史消息数据中的语义化显示名称。
  // 新工具 schema 已不再包含 actionName 字段。
  const actionName = typeof inputObject?.actionName === "string" ? inputObject.actionName.trim() : "";
  if (actionName) return actionName;

  return resolveToolDisplayName({
    title: part.title,
    toolName: part.toolName,
    type: part.type,
  });
}

/** Resolve tool key for routing (lowercase). */
export function getToolKind(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

/** Resolve tool id from part type/toolName. */
export function getToolId(part: AnyToolPart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName.trim();
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return "";
}

/** Determine whether tool rendering should show streaming state. */
export function isToolStreaming(part: { state?: string; streaming?: boolean }): boolean {
  return (
    part.streaming === true ||
    part.state === "input-streaming" ||
    part.state === "output-streaming"
  );
}

/** Normalize any value into displayable string. */
export function safeStringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Parse JSON text safely. */
export function parseJsonValue(value: unknown): unknown | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const maybeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!maybeJson) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** Normalize tool input, allowing JSON string payloads. */
export function normalizeToolInput(value: unknown): unknown {
  const parsed = parseJsonValue(value);
  return parsed ?? value;
}

/** Ensure value is a plain object. */
export function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Format duration in milliseconds. */
export function formatDurationMs(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${Math.round((value / 1000) * 10) / 10}s`;
}

/** Format command array or string to a single line. */
export function formatCommand(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" ");
  if (typeof value === "string") return value.trim();
  return safeStringify(value);
}

/** Truncate long text for previews. */
export function truncateText(value: string, maxLength = 120): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

/** Check whether tool input is empty. */
export function isEmptyInput(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/** Resolve approval id from tool part. */
export function getApprovalId(part: AnyToolPart): string | undefined {
  return typeof part.approval?.id === "string" ? part.approval?.id : undefined;
}

/** Determine if tool is awaiting approval decision. */
export function isApprovalPending(part: AnyToolPart): boolean {
  const decided = part.approval?.approved === true || part.approval?.approved === false;
  if (decided) return false;
  // 逻辑：approval-requested 是正常的待审批状态（有 approval.id）
  // input-available 是历史数据中模型流不完整导致的"准待审批"状态（有 input 但无 approval）
  // 两者都应该被视为需要用户操作的状态
  return part.state === "approval-requested" || part.state === "input-available" || part.state == null;
}

/**
 * Trim absolute file path to a display-friendly relative path.
 * - If the path starts with projectRoot, strip it to show a relative path.
 * - Otherwise return the original path.
 */
export function getDisplayPath(filePath: string, projectRootUri?: string): string {
  if (!filePath || !projectRootUri) return filePath
  const root = projectRootUri.endsWith('/') ? projectRootUri : `${projectRootUri}/`
  if (filePath.startsWith(root)) return filePath.slice(root.length)
  if (filePath === projectRootUri) return '.'
  return filePath
}

/** Resolve output state for tool rendering. */
export function getToolOutputState(part: AnyToolPart): ToolOutputState {
  const outputText = safeStringify(part.output);
  const hasErrorText =
    typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const displayText =
    outputText ||
    (hasErrorText
      ? `（错误：${part.errorText}）`
      : part.state && part.state !== "output-available"
        ? `（${part.state}）`
        : "（暂无返回结果）");

  return { outputText, hasErrorText, displayText };
}
