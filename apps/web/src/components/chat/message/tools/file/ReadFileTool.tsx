"use client";

import ToolApprovalActions from "../shared/ToolApprovalActions";
import ToolApprovalPrompt from "../shared/ToolApprovalPrompt";
import {
  asPlainObject,
  extractOutputSection,
  formatValue,
  getApprovalId,
  getToolOutputState,
  isApprovalPending,
  normalizeToolInput,
  safeStringify,
} from "../shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ReadFileToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render read-file tool output. */
export default function ReadFileTool({ part, className }: ReadFileToolProps) {
  const input = asPlainObject(normalizeToolInput(part.input)) ?? {};
  const path = formatValue(input.path) || "—";
  const offset = formatValue(input.offset);
  const limit = formatValue(input.limit);
  const rangeLabel = [offset !== "—" ? offset : null, limit !== "—" ? limit : null]
    .filter(Boolean)
    .join(", ");

  const { hasErrorText } = getToolOutputState(part);
  const rawOutput = extractOutputSection(safeStringify(part.output));

  const approvalId = getApprovalId(part);
  const isApprovalRequested = isApprovalPending(part);
  const isRejected = part.approval?.approved === false;

  const outputText = hasErrorText
    ? String(part.errorText ?? "")
    : rawOutput || (part.state ? `（${part.state}）` : "");
  const resolvedOutput = isRejected ? "已拒绝" : outputText || "（无输出）";

  return (
    <ToolApprovalPrompt
      action="需要读取文件"
      primary={path}
      secondary={rangeLabel ? `范围：${rangeLabel}` : undefined}
      className={className}
      isApprovalRequested={isApprovalRequested}
      isRejected={isRejected}
      actions={isApprovalRequested && approvalId ? <ToolApprovalActions approvalId={approvalId} /> : null}
      output={isApprovalRequested ? undefined : resolvedOutput}
      outputTone={hasErrorText || isRejected ? "error" : "default"}
    />
  );
}
