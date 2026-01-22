"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export type ToolBadgeTone = "default" | "success" | "warning" | "error";

interface ToolInfoCardProps {
  /** Tool title. */
  title: string;
  /** Status badge tone. */
  statusTone?: ToolBadgeTone;
  /** Raw input content. */
  inputText: string;
  /** Raw output content. */
  outputText?: string;
  /** Output tone. */
  outputTone?: "default" | "error" | "muted";
  /** Whether approval is requested. */
  isApprovalRequested?: boolean;
  /** Whether the tool is rejected. */
  isRejected?: boolean;
  /** Header action nodes. */
  actions?: React.ReactNode;
  /** Extra class names for wrapper. */
  className?: string;
}

/** Render a card-style tool container. */
export default function ToolInfoCard({
  title,
  statusTone = "default",
  inputText,
  outputText,
  outputTone = "default",
  isApprovalRequested,
  isRejected,
  actions,
  className,
}: ToolInfoCardProps) {
  const containerClassName = isApprovalRequested
    ? "tenas-thinking-border tenas-thinking-border-on border border-transparent"
    : isRejected
      ? "border border-destructive/50 bg-destructive/5"
      : "border border-border/40 bg-muted/20";
  const containerStyle = isApprovalRequested
    ? ({
        // 中文注释：保持彩虹外框内填充与卡片背景一致。
        ["--tenas-thinking-border-fill" as any]: "var(--color-muted)",
      } as React.CSSProperties)
    : undefined;
  const defaultOpen = isApprovalRequested || isRejected || outputTone === "error";
  const statusDotClassName =
    statusTone === "success"
      ? "bg-emerald-500"
      : statusTone === "warning"
        ? "bg-amber-500"
        : statusTone === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/70";

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <Accordion type="single" collapsible defaultValue={defaultOpen ? "tool" : undefined} className="w-full">
        <AccordionItem
          value="tool"
          className={cn(
            "w-full min-w-0 max-w-[80%] rounded-xl px-3 py-2 last:border-b",
            containerClassName,
          )}
          style={containerStyle}
        >
          <AccordionTrigger className="py-1 text-[12px] font-medium text-foreground/80 hover:no-underline">
            <div className="flex w-full items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("mt-0.5 inline-block size-2 shrink-0 rounded-full", statusDotClassName)} />
                <span className="truncate">{title}</span>
              </div>
              <div
                className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                role="presentation"
              >
                {isApprovalRequested ? (
                  <span className="rounded-full px-2 py-0.5 font-medium bg-amber-500/10 text-amber-600">
                    等待审批
                  </span>
                ) : null}
                {isRejected ? (
                  <span className="rounded-full px-2 py-0.5 font-medium bg-destructive/10 text-destructive">
                    已拒绝
                  </span>
                ) : null}
                {actions}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 text-xs text-muted-foreground/80">
            <div className="mt-2 grid gap-2">
              <section className="rounded-lg border border-border/50 bg-background/60 p-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">输入</div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
                  {inputText}
                </pre>
              </section>
              <section className="rounded-lg border border-border/50 bg-background/60 p-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">输出</div>
                <pre
                  className={cn(
                    "mt-2 whitespace-pre-wrap break-words font-mono text-[11px]",
                    outputTone === "error" && "text-destructive",
                    outputTone === "muted" && "text-muted-foreground",
                    outputTone === "default" && "text-foreground/80",
                  )}
                >
                  {outputText ?? ""}
                </pre>
              </section>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
