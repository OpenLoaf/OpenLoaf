"use client";

import * as React from "react";
import { Terminal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CliThinkingToolPart = {
  /** Tool title for display. */
  title?: string;
  /** Tool output content. */
  output?: unknown;
  /** Tool running state. */
  state?: string;
  /** Tool error message. */
  errorText?: string;
};

/** Resolve status text for the CLI tool output. */
function getCliStatusText(part: CliThinkingToolPart): string {
  if (typeof part.errorText === "string" && part.errorText.trim()) return "失败";
  if (part.state === "output-available") return "完成";
  return "运行中";
}

/** Normalize output text for CLI rendering. */
function getCliOutputText(part: CliThinkingToolPart): string {
  const output = part.output ?? "";
  if (typeof output === "string") return output;
  if (output == null) return "";
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/**
 * CLI thinking tool renderer.
 */
export default function CliThinkingTool({ part }: { part: CliThinkingToolPart }) {
  const title = part.title || "CLI 输出";
  const statusText = getCliStatusText(part);
  const outputText = getCliOutputText(part);
  const hasError = typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const isStreaming = part.state === "output-streaming";

  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <div className="flex w-full min-w-0 max-w-full justify-start">
      <details
        className="w-full min-w-0 max-w-[80%] rounded-lg border border-foreground/10 bg-foreground/95 px-3 py-2 text-background shadow-sm"
        open={isExpanded}
        onToggle={(event) => setIsExpanded(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-background/70">
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate">
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-background/10">
              <Terminal className="size-3 text-background/80" />
            </span>
            <span className="shrink-0">{title}</span>
            <span className="ml-2 text-[11px] text-background/60">{statusText}</span>
          </div>
          <ChevronDown
            className={cn(
              "size-3 text-background/60 transition-transform",
              isExpanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </summary>

        <div className="mt-2 rounded-md bg-background/5 px-3 py-2">
          {hasError ? (
            <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-red-300/90">
              {part.errorText}
            </pre>
          ) : !outputText.trim() ? (
            <div className="text-[12px] leading-relaxed text-background/60">
              {/* 中文注释：CLI 输出未开始时显示占位文案。 */}
              <span className={cn(isStreaming && "tenas-thinking-scan")}>等待 CLI 输出...</span>
            </div>
          ) : (
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-background/90">
              {outputText}
            </pre>
          )}
        </div>
      </details>
    </div>
  );
}
