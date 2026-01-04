"use client";

import * as React from "react";
import type { SubAgentStreamPayload, SubAgentToolOutput } from "@teatime-ai/api/types/tools/subAgent";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderMessageParts } from "../renderMessageParts";

// MVP：子 Agent 流式输出折叠卡片，内容沿用消息渲染规则。
type AnyToolPart = {
  /** Tool part type marker. */
  type?: string;
  /** Tool name for routing. */
  toolName?: string;
  /** Tool runtime state. */
  state?: string;
  /** Tool output payload. */
  output?: unknown;
};

/** Resolve sub-agent payload from a tool part. */
function getSubAgentPayload(part: AnyToolPart): SubAgentStreamPayload | null {
  if (!part || typeof part !== "object") return null;
  const output = part.output as SubAgentToolOutput | SubAgentStreamPayload | undefined;
  if (!output) return null;
  if ((output as SubAgentStreamPayload).type === "sub-agent-stream") {
    return output as SubAgentStreamPayload;
  }
  if ((output as SubAgentToolOutput).data?.type === "sub-agent-stream") {
    return (output as SubAgentToolOutput).data;
  }
  return null;
}

/** Maps sub-agent status to a readable label. */
function getStatusText(payload: SubAgentStreamPayload | null, fallback?: string): string {
  if (!payload) return fallback || "运行中";
  if (payload.status === "error") return "失败";
  if (payload.status === "done") return "完成";
  return "运行中";
}

/** Sub-agent streaming tool output container. */
export function SubAgentTool({ part, className }: { part: AnyToolPart; className?: string }) {
  const payload = getSubAgentPayload(part);
  const statusText = getStatusText(payload, part.state);
  const agentName = payload?.agent?.name ?? "sub-agent";
  const isStreaming = payload?.status === "streaming";
  const shouldExpand = isStreaming || payload?.status === "error";
  const [isExpanded, setIsExpanded] = React.useState(shouldExpand);

  React.useEffect(() => {
    if (shouldExpand) setIsExpanded(true);
  }, [shouldExpand]);

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <details
        className="w-full min-w-0 max-w-[80%] rounded-lg bg-muted/40 px-3 py-2 text-foreground"
        open={isExpanded}
        onToggle={(event) => setIsExpanded(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
            <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  isExpanded ? "rotate-0" : "-rotate-90",
                )}
              />
            </span>
            <span className="shrink-0">子 Agent：</span>
            <span className="text-foreground/80">{agentName}</span>
            <span className="ml-2 text-[11px] text-muted-foreground/80">{statusText}</span>
          </div>
        </summary>

        <div className="mt-2 space-y-2">
          {payload ? (
            <div className="space-y-2">
              {payload.status === "error" && payload.errorText ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {payload.errorText}
                </div>
              ) : null}
              {renderMessageParts(payload.parts as any[], {
                isAnimating: isStreaming,
                toolVariant: "nested",
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">正在启动子 Agent...</div>
          )}
        </div>
      </details>
    </div>
  );
}

/** React display name for debug tools. */
SubAgentTool.displayName = "SubAgentTool";
