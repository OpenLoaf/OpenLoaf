"use client";

import ToolApprovalActions from "../shared/ToolApprovalActions";
import ToolApprovalPrompt from "../shared/ToolApprovalPrompt";
import {
  asPlainObject,
  extractOutputSection,
  formatCommand,
  formatValue,
  getApprovalId,
  getToolOutputState,
  isApprovalPending,
  normalizeToolInput,
  safeStringify,
} from "../shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ExecCommandToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render exec-command tool output. */
export default function ExecCommandTool({ part, className }: ExecCommandToolProps) {
  const input = asPlainObject(normalizeToolInput(part.input)) ?? {};
  const cmd = formatCommand(input.cmd ?? part.input) || "—";
  const workdir = formatValue(input.workdir);

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
      action="需要启动交互命令"
      primary={cmd}
      secondary={workdir !== "—" ? `目录：${workdir}` : undefined}
      className={className}
      isApprovalRequested={isApprovalRequested}
      isRejected={isRejected}
      actions={isApprovalRequested && approvalId ? <ToolApprovalActions approvalId={approvalId} /> : null}
      output={isApprovalRequested ? undefined : resolvedOutput}
      outputTone={hasErrorText || isRejected ? "error" : "default"}
    />
  );
}
