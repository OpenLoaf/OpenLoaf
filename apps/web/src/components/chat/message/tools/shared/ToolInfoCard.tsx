"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import ToolInfoRows, { type ToolInfoRow } from "./ToolInfoRows";
import ToolOutputPanel, { type ToolOutputPanelProps } from "./ToolOutputPanel";

export type ToolBadgeTone = "default" | "success" | "warning" | "error";

interface ToolInfoCardProps {
  /** Tool title. */
  title: string;
  /** Action summary. */
  action?: string;
  /** Status label text. */
  status: string;
  /** Status badge tone. */
  statusTone?: ToolBadgeTone;
  /** Parameter rows. */
  params: ToolInfoRow[];
  /** Output configuration. */
  output?: ToolOutputPanelProps;
  /** Whether approval is requested. */
  isApprovalRequested?: boolean;
  /** Whether the tool is rejected. */
  isRejected?: boolean;
  /** Header action nodes. */
  actions?: React.ReactNode;
  /** Extra class names for wrapper. */
  className?: string;
}

function getBadgeClassName(tone: ToolBadgeTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-500/10 text-emerald-600";
    case "warning":
      return "bg-amber-500/10 text-amber-600";
    case "error":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted/60 text-muted-foreground";
  }
}

/** Render a card-style tool container. */
export default function ToolInfoCard({
  title,
  action,
  status,
  statusTone = "default",
  params,
  output,
  isApprovalRequested,
  isRejected,
  actions,
  className,
}: ToolInfoCardProps) {
  const cardClassName = isApprovalRequested
    ? "tenas-thinking-border tenas-thinking-border-on border border-transparent"
    : isRejected
      ? "border border-destructive/50 bg-destructive/5"
      : "border border-border/60 bg-muted/30";
  const cardStyle = isApprovalRequested
    ? ({
        // 中文注释：保持彩虹外框内填充与卡片背景一致。
        ["--tenas-thinking-border-fill" as any]: "var(--color-muted)",
      } as React.CSSProperties)
    : undefined;

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <div
        className={cn(
          "w-full min-w-0 max-w-[80%] rounded-xl px-3 py-3 text-foreground",
          cardClassName,
        )}
        style={cardStyle}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">工具</div>
            <div className="text-sm font-medium text-foreground truncate">{title}</div>
            {action ? (
              <div className="mt-1 text-xs text-muted-foreground/80 break-words">{action}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isApprovalRequested ? (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-600">
                等待审批
              </span>
            ) : null}
            {isRejected ? (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-destructive/10 text-destructive">
                已拒绝
              </span>
            ) : null}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", getBadgeClassName(statusTone))}>
              {status}
            </span>
            {actions}
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          <section className="rounded-lg border border-border/60 bg-background/70 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">参数</div>
            <ToolInfoRows rows={params} className="mt-2" />
          </section>

          {!isApprovalRequested && output ? <ToolOutputPanel {...output} /> : null}
        </div>
      </div>
    </div>
  );
}
