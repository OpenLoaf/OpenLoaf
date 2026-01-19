"use client";

import * as React from "react";
import ToolApprovalActions from "./ToolApprovalActions";
import ToolInfoCard from "./ToolInfoCard";
import ToolOutputPanel from "./ToolOutputPanel";
import {
  formatValue,
  getApprovalId,
  getToolName,
  getToolOutputState,
  getToolStatusText,
  getToolStatusTone,
  isApprovalPending,
  normalizeToolInput,
  safeStringify,
  truncateText,
} from "./tool-utils";
import type { AnyToolPart, ToolVariant } from "./tool-utils";

interface GenericToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
  /** Optional title override. */
  title?: string;
}

/** Render a generic tool card with input/output sections. */
export default function GenericTool({ part, className, title }: GenericToolProps) {
  const toolName = title ?? getToolName(part);
  const statusText = getToolStatusText(part);
  const statusTone = getToolStatusTone(part);
  const normalizedInput = normalizeToolInput(part.input);
  const inputText = typeof normalizedInput === "string" ? normalizedInput : safeStringify(normalizedInput);
  const inputPreview = truncateText(inputText || formatValue(part.input));
  const { outputText, hasErrorText, displayText } = getToolOutputState(part);
  const outputBody = hasErrorText
    ? String(part.errorText ?? "")
    : outputText || displayText;

  const approvalId = getApprovalId(part);
  const isApprovalRequested = isApprovalPending(part);
  const isRejected = part.approval?.approved === false;

  return (
    <ToolInfoCard
      title={toolName}
      action="通用工具调用"
      status={statusText}
      statusTone={statusTone}
      className={className}
      isApprovalRequested={isApprovalRequested}
      isRejected={isRejected}
      actions={isApprovalRequested && approvalId ? <ToolApprovalActions approvalId={approvalId} /> : null}
      params={[
        {
          label: "输入",
          value: inputPreview,
          mono: true,
        },
      ]}
      output={{
        title: "结果",
        summaryRows: [
          {
            label: "状态",
            value: hasErrorText ? "失败" : outputText ? "完成" : "无输出",
            tone: hasErrorText ? "danger" : "muted",
          },
        ],
        rawText: outputBody,
        tone: hasErrorText ? "error" : "default",
        defaultOpen: hasErrorText,
      }}
    />
  );
}
