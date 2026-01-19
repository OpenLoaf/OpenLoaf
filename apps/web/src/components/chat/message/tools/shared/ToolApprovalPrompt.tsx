"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ToolApprovalPromptProps {
  /** Action hint shown above the main line. */
  action: string;
  /** Main content line, typically the command. */
  primary: string;
  /** Optional secondary line. */
  secondary?: string;
  /** Whether approval is currently requested. */
  isApprovalRequested: boolean;
  /** Whether the approval was rejected. */
  isRejected?: boolean;
  /** Approval action buttons. */
  actions?: React.ReactNode;
  /** Output text shown after approval. */
  output?: string;
  /** Output tone. */
  outputTone?: "default" | "error" | "muted";
  /** Extra class names for wrapper. */
  className?: string;
}

/** Render a minimal approval prompt for tools that require consent. */
export default function ToolApprovalPrompt({
  action,
  primary,
  secondary,
  isApprovalRequested,
  isRejected,
  actions,
  output,
  outputTone = "default",
  className,
}: ToolApprovalPromptProps) {
  const containerClassName = isApprovalRequested
    ? "tenas-thinking-border tenas-thinking-border-on border border-transparent"
    : isRejected
      ? "border border-destructive/50 bg-destructive/5"
      : "border border-border/60 bg-muted/30";
  const containerStyle = isApprovalRequested
    ? ({ ["--tenas-thinking-border-fill" as any]: "var(--color-muted)" } as React.CSSProperties)
    : undefined;

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <div
        className={cn(
          "w-full min-w-0 max-w-[80%] rounded-lg px-3 py-2 text-xs text-foreground",
          containerClassName,
        )}
        style={containerStyle}
      >
        <div className="text-[11px] text-muted-foreground">{action}</div>
        <div className="mt-1 max-h-28 overflow-auto show-scrollbar font-mono text-[12px] text-foreground break-words">
          {primary}
        </div>
        {secondary ? (
          <div className="mt-1 text-[11px] text-muted-foreground break-words">{secondary}</div>
        ) : null}
        {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
        {!isApprovalRequested && output ? (
          <div
            className={cn(
              "mt-2 max-h-64 overflow-auto show-scrollbar border-t border-border/60 pt-2 whitespace-pre-wrap break-words text-xs",
              outputTone === "error" && "text-destructive",
              outputTone === "muted" && "text-muted-foreground",
              outputTone === "default" && "text-foreground/90",
            )}
          >
            {output}
          </div>
        ) : null}
      </div>
    </div>
  );
}
