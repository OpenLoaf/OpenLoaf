"use client";

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
  /** Tool output payload. */
  output?: unknown;
  /** Tool error text. */
  errorText?: string;
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

/** Resolve tool display name. */
export function getToolName(part: AnyToolPart): string {
  if (part.title) return part.title;
  if (part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
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
