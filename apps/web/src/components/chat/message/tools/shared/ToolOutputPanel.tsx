"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ToolInfoRows, { type ToolInfoRow } from "./ToolInfoRows";

export interface ToolOutputPanelProps {
  /** Section title. */
  title?: string;
  /** Summary rows to show above details. */
  summaryRows?: ToolInfoRow[];
  /** Raw output text. */
  rawText?: string;
  /** Custom body node. */
  body?: React.ReactNode;
  /** Tone for raw output text. */
  tone?: "default" | "error";
  /** Whether the details are collapsible. */
  collapsible?: boolean;
  /** Default open state for the details. */
  defaultOpen?: boolean;
}

/** Render tool output with optional summary and details. */
export default function ToolOutputPanel({
  title = "输出",
  summaryRows,
  rawText,
  body,
  tone = "default",
  collapsible = true,
  defaultOpen = false,
}: ToolOutputPanelProps) {
  const hasContent = Boolean(body) || Boolean(rawText);

  const contentNode = body ?? (
    <pre
      className={cn(
        "max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs",
        tone === "error" ? "text-destructive" : "text-foreground/90",
      )}
    >
      {rawText}
    </pre>
  );

  return (
    <section className="rounded-lg border border-border/60 bg-background/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      </div>
      {summaryRows && summaryRows.length > 0 ? (
        <ToolInfoRows rows={summaryRows} className="mt-2" />
      ) : null}
      {!hasContent ? (
        <div className="mt-2 text-xs text-muted-foreground">暂无输出</div>
      ) : collapsible ? (
        <details className="mt-2 group" open={defaultOpen}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground">
            <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
            <span>查看原始输出</span>
          </summary>
          <div className="mt-2 rounded-md bg-muted/30 p-2">{contentNode}</div>
        </details>
      ) : (
        <div className="mt-2 rounded-md bg-muted/30 p-2">{contentNode}</div>
      )}
    </section>
  );
}
