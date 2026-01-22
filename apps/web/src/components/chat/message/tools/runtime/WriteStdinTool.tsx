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
  truncateText,
} from "../shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface WriteStdinToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render write-stdin tool output. */
export default function WriteStdinTool({ part, className }: WriteStdinToolProps) {
  const input = asPlainObject(normalizeToolInput(part.input)) ?? {};
  const sessionId = formatValue(input.sessionId) || "—";
  const chars = typeof input.chars === "string" ? input.chars : "";
  const secondary = chars ? `内容：${truncateText(chars)}` : undefined;

  const { hasErrorText } = getToolOutputState(part);
  const rawOutput = extractOutputSection(safeStringify(part.output));

  const approvalId = getApprovalId(part);
  const isApprovalRequested = isApprovalPending(part);
  const isRejected = part.approval?.approved === false;

  const stateLabel =
    part.state === "approval-requested" && !isApprovalRequested ? "执行中" : part.state;
  const outputText = hasErrorText
    ? String(part.errorText ?? "")
    : rawOutput || (stateLabel ? `（${stateLabel}）` : "");
  const resolvedOutput = isRejected ? "已拒绝" : outputText || "（无输出）";

  return (
    <ToolApprovalPrompt
      action="需要写入交互会话"
      primary={`会话：${sessionId}`}
      secondary={secondary}
      className={className}
      isApprovalRequested={isApprovalRequested}
      isRejected={isRejected}
      actions={isApprovalRequested && approvalId ? <ToolApprovalActions approvalId={approvalId} /> : null}
      output={isApprovalRequested ? undefined : resolvedOutput}
      outputTone={hasErrorText || isRejected ? "error" : "default"}
      codeStyle
    />
  );
}
