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
};

export type ToolJsonDisplay = {
  /** JSON text shown in collapsed mode. */
  collapsedText: string;
  /** JSON text shown in expanded mode. */
  expandedText: string;
};

export type ToolOutputState = {
  /** Raw output text from tool. */
  outputText: string;
  /** Whether the tool has error text. */
  hasErrorText: boolean;
  /** Display text for empty output or pending state. */
  displayText: string;
};

export type ToolStatusTone = "default" | "success" | "warning" | "error";

/** Resolve tool display name. */
export function getToolName(part: AnyToolPart): string {
  const actionName = getToolActionName(part);
  if (actionName) return actionName;

  return resolveToolDisplayName({
    title: part.title,
    toolName: part.toolName,
    type: part.type,
  });
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

/** Resolve actionName from tool input. */
export function getToolActionName(part: AnyToolPart): string {
  const inputPayload = normalizeToolInput(part.input);
  const inputObject = asPlainObject(inputPayload);
  return typeof inputObject?.actionName === "string" ? inputObject.actionName.trim() : "";
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

/** Format value into a readable string. */
export function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") return value.trim() || "—";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
  return formatValue(value);
}

/** Truncate long text for previews. */
export function truncateText(value: string, maxLength = 120): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

/** Extract the output section from unified tool outputs. */
export function extractOutputSection(value: string): string {
  const marker = "Output:";
  const index = value.indexOf(marker);
  if (index === -1) return value.trim();
  return value.slice(index + marker.length).trimStart();
}

/** Resolve JSON rendering payload when the value is JSON or JSON-like. */
export function getJsonDisplay(value: unknown): ToolJsonDisplay | null {
  if (value == null) return null;

  try {
    if (typeof value === "string") {
      const trimmed = value.trim();
      // 中文注释：先做轻量前置判断，避免对普通文本频繁 JSON.parse。
      const maybeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
      if (!maybeJson) return null;

      const parsed = JSON.parse(trimmed) as unknown;
      return {
        collapsedText: JSON.stringify(parsed),
        expandedText: JSON.stringify(parsed, null, 2),
      };
    }

    if (typeof value === "object") {
      return {
        collapsedText: JSON.stringify(value),
        expandedText: JSON.stringify(value, null, 2),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Check whether tool input is empty. */
export function isEmptyInput(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/** Resolve status text for tool header. */
export function getToolStatusText(part: AnyToolPart): string {
  if (typeof part.errorText === "string" && part.errorText.trim()) return "失败";
  if (part.state && part.state !== "output-available") return String(part.state);
  if (part.output != null) return "完成";
  return "运行中";
}

/** Resolve status tone for tool header. */
export function getToolStatusTone(part: AnyToolPart): ToolStatusTone {
  if (typeof part.errorText === "string" && part.errorText.trim()) return "error";
  if (isApprovalPending(part)) return "warning";
  if (part.state === "output-error" || part.state === "output-denied") return "error";
  if (part.state === "output-available") return "success";
  if (part.output != null) return "success";
  return "default";
}

/** Resolve approval id from tool part. */
export function getApprovalId(part: AnyToolPart): string | undefined {
  return typeof part.approval?.id === "string" ? part.approval?.id : undefined;
}

/** Determine if tool is awaiting approval decision. */
export function isApprovalPending(part: AnyToolPart): boolean {
  const approvalId = getApprovalId(part);
  const decided = part.approval?.approved === true || part.approval?.approved === false;
  if (!approvalId || decided) return false;
  return part.state === "approval-requested" || part.state == null;
}

/** Count pending tool approvals in UI messages. */
export function countPendingToolApprovals(
  messages: Array<{ parts?: unknown[] }>,
): number {
  let count = 0;
  for (const message of messages) {
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const type = typeof (part as { type?: unknown }).type === "string"
        ? (part as { type?: string }).type ?? ""
        : "";
      const isTool = type === "dynamic-tool" || type.startsWith("tool-");
      if (!isTool) continue;
      // 中文注释：只有审批中的工具才计数，避免误触发继续执行。
      if (isApprovalPending(part as AnyToolPart)) count += 1;
    }
  }
  return count;
}

/** Detect if any tool approval was rejected. */
export function hasRejectedToolApproval(
  messages: Array<{ parts?: unknown[] }>,
): boolean {
  for (const message of messages) {
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const type = typeof (part as { type?: unknown }).type === "string"
        ? (part as { type?: string }).type ?? ""
        : "";
      const isTool = type === "dynamic-tool" || type.startsWith("tool-");
      if (!isTool) continue;
      const approval = (part as AnyToolPart).approval;
      // 中文注释：任一工具被拒绝则阻止自动继续。
      if (approval?.approved === false) return true;
    }
  }
  return false;
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
