"use client";

import * as React from "react";
import ToolApprovalActions from "./ToolApprovalActions";
import { cn } from "@/lib/utils";
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
  const inputText =
    typeof normalizedInput === "string" ? normalizedInput : safeStringify(normalizedInput);
  const inputBody = inputText || formatValue(part.input);
  const { outputText, hasErrorText, displayText } = getToolOutputState(part);
  const outputBody = hasErrorText
    ? String(part.errorText ?? "")
    : outputText || displayText;

  const approvalId = getApprovalId(part);
  const isApprovalRequested = isApprovalPending(part);
  const isRejected = part.approval?.approved === false;

  const containerClassName = isApprovalRequested
    ? "tenas-thinking-border tenas-thinking-border-on border border-transparent"
    : isRejected
      ? "border border-destructive/50 bg-destructive/5"
      : "border border-border/60 bg-muted/30";
  const containerStyle = isApprovalRequested
    ? ({ ["--tenas-thinking-border-fill" as any]: "var(--color-muted)" } as React.CSSProperties)
    : undefined;
  const statusClassName =
    statusTone === "success"
      ? "text-emerald-600"
      : statusTone === "warning"
        ? "text-amber-600"
        : statusTone === "error"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <div
        className={cn(
          "w-full min-w-0 max-w-[80%] rounded-lg px-3 py-2 text-xs text-foreground",
          containerClassName,
        )}
        style={containerStyle}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-xs font-medium text-foreground">{toolName}</div>
          <div className={cn("text-[11px]", statusClassName)}>{statusText}</div>
        </div>

        <div className="mt-2">
          <div className="text-[11px] text-muted-foreground">输入</div>
          <pre className="mt-1 max-h-32 overflow-auto show-scrollbar whitespace-pre-wrap break-words font-mono text-[12px] text-foreground/90">
            {inputBody || "—"}
          </pre>
        </div>

        {isApprovalRequested && approvalId ? (
          <div className="mt-2">
            <ToolApprovalActions approvalId={approvalId} />
          </div>
        ) : null}

        {!isApprovalRequested ? (
          <div className="mt-2 border-t border-border/60 pt-2">
            <div className="text-[11px] text-muted-foreground">输出</div>
            <pre
              className={cn(
                "mt-1 max-h-64 overflow-auto show-scrollbar whitespace-pre-wrap break-words text-xs",
                hasErrorText ? "text-destructive" : "text-foreground/90",
              )}
            >
              {outputBody || "暂无输出"}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
