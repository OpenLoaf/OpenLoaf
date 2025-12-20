"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { renderMessageParts } from "../renderMessageParts";

type AnyToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function safeParseJson(value: unknown): any {
  if (value == null) return undefined;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractSubAgentInput(part: AnyToolPart) {
  const input = safeParseJson(part.input) ?? {};
  const name = typeof (input as any)?.name === "string" ? String((input as any).name) : "subAgent";
  const task = typeof (input as any)?.task === "string" ? String((input as any).task) : "";
  return { name, task };
}

function extractOutputMarkdown(part: AnyToolPart) {
  const output = safeParseJson(part.output) ?? part.output;
  const markdown =
    typeof (output as any)?.data?.outputMarkdown === "string"
      ? String((output as any).data.outputMarkdown)
      : "";
  return markdown.trim();
}

function isRunning(part: AnyToolPart) {
  if (part.errorText) return false;
  if (part.state && part.state !== "output-available") return true;
  return part.output == null;
}

/**
 * subAgent 工具卡片（MVP）
 * - 只保留：task / output /（可选）messages
 * - 去掉三段式折叠与动画，减少体积
 */
export default function MessageToolSubAgent({
  part,
  subMessages,
  className,
}: {
  part: AnyToolPart;
  subMessages: UIMessage[];
  className?: string;
}) {
  const { name, task } = extractSubAgentInput(part);
  const outputMarkdown = extractOutputMarkdown(part);
  const running = isRunning(part);
  const hasMessages = (subMessages?.length ?? 0) > 0;

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <details className="w-full min-w-0 max-w-[80%] rounded-lg bg-muted/30 px-3 py-2 text-foreground" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="min-w-0 flex-1 truncate">
            <span className="text-foreground/80">{name}</span>
            {running ? <span className="ml-2 text-[11px] text-muted-foreground/80">运行中…</span> : null}
          </div>
          {typeof part.errorText === "string" && part.errorText.trim() ? (
            <span className="text-[11px] text-destructive/80">失败</span>
          ) : null}
        </summary>

        <div className="mt-2 space-y-2">
          <div>
            <div className="text-[11px] text-muted-foreground">Task</div>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words bg-background p-2 text-xs text-muted-foreground">
              {task || "（无 task）"}
            </pre>
          </div>

          {hasMessages ? (
            <details className="rounded bg-background p-2" open={false}>
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground">Messages</summary>
              <div className="mt-2 space-y-2">
                {subMessages.map((m, idx) => (
                  <div key={m.id ?? idx} className="min-w-0">
                    {renderMessageParts((m as any).parts ?? [], {
                      textClassName: "px-0 text-xs text-muted-foreground leading-relaxed",
                      renderTools: true,
                    })}
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <div>
            <div className="text-[11px] text-muted-foreground">Output</div>
            <div className="mt-1 max-h-80 overflow-auto bg-background p-2">
              {outputMarkdown
                ? renderMessageParts([{ type: "text", text: outputMarkdown }], {
                    textClassName: "px-0 text-xs text-muted-foreground leading-relaxed",
                    renderTools: true,
                  })
                : <div className="text-xs text-muted-foreground">（暂无 output）</div>}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

