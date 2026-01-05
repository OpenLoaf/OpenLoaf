"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { renderMessageParts } from "../renderMessageParts";
import { useChatContext } from "../../ChatProvider";

type SubAgentToolPart = {
  type?: string;
  toolName?: string;
  title?: string;
  state?: string;
  toolCallId?: string;
  input?: { name?: string; task?: string } | unknown;
  output?: unknown;
  errorText?: string;
};

/** Resolve sub-agent display name. */
function getSubAgentName(part: SubAgentToolPart): string {
  const input = part.input as { name?: string } | undefined;
  if (input && typeof input.name === "string" && input.name.trim()) return input.name.trim();
  if (part.title && part.title.trim()) return part.title.trim();
  return "SubAgent";
}

/** Resolve sub-agent task text. */
function getSubAgentTask(part: SubAgentToolPart): string {
  const input = part.input as { task?: string } | undefined;
  if (input && typeof input.task === "string") return input.task;
  return "";
}

/** Resolve sub-agent status text. */
function getSubAgentStatus(part: SubAgentToolPart): string {
  if (typeof part.errorText === "string" && part.errorText.trim()) return "失败";
  if (part.state === "output-available") return "完成";
  return "运行中";
}

/**
 * Sub-agent tool renderer.
 */
export default function SubAgentTool({ part }: { part: SubAgentToolPart }) {
  const { subAgentStreams } = useChatContext();
  const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
  const stream = toolCallId ? subAgentStreams[toolCallId] : undefined;

  // 中文注释：以流式缓存为准，确保 delta 持续可见。
  const effectiveInput = (stream?.name || stream?.task)
    ? { name: stream?.name, task: stream?.task }
    : part.input;
  const effectiveOutput =
    stream ? stream.output : typeof part.output === "string" ? part.output : "";
  const effectiveErrorText = stream?.errorText || part.errorText;
  const effectiveState = stream?.state || part.state;

  const name = getSubAgentName({ ...part, input: effectiveInput });
  const task = getSubAgentTask({ ...part, input: effectiveInput });
  const statusText = getSubAgentStatus({ ...part, errorText: effectiveErrorText, state: effectiveState });
  const isStreaming = effectiveState === "output-streaming";
  const outputText = effectiveOutput;

  const [isExpanded, setIsExpanded] = React.useState(true);
  const outputRef = React.useRef<HTMLDivElement | null>(null);
  const outputPinnedRef = React.useRef(true);
  const outputLastScrollTopRef = React.useRef(0);

  // 中文注释：把子Agent输出映射成标准 AI 消息 part，确保渲染效果一致。
  const nestedParts = React.useMemo(
    () => [{ type: "text", text: outputText }],
    [outputText],
  );

  React.useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (!outputPinnedRef.current && distanceFromBottom > 8) return;
    // 中文注释：子Agent输出区在流式时自动贴底。
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [outputText, isStreaming]);

  const handleOutputScroll = React.useCallback(() => {
    const el = outputRef.current;
    if (!el) return;
    const currentScrollTop = el.scrollTop;
    const distanceFromBottom = el.scrollHeight - (currentScrollTop + el.clientHeight);
    const scrolledUp = currentScrollTop < outputLastScrollTopRef.current - 2;
    if (scrolledUp && distanceFromBottom > 8) {
      outputPinnedRef.current = false;
    } else if (distanceFromBottom <= 8) {
      outputPinnedRef.current = true;
    }
    outputLastScrollTopRef.current = currentScrollTop;
  }, []);

  return (
    <div className="flex w-full min-w-0 max-w-full justify-start">
      <details
        className="w-full min-w-0 rounded-lg bg-muted/40 px-3 py-2 text-foreground"
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
            <span className="shrink-0">子Agent：</span>
            <span className="text-foreground/80">{name}</span>
            <span className="ml-2 text-[11px] text-muted-foreground/80">{statusText}</span>
          </div>
        </summary>

        <div className="mt-2 space-y-2">
          {task ? (
            <div>
              <div className="text-[11px] text-muted-foreground">任务</div>
              <pre className="mt-1 whitespace-pre-wrap break-words bg-background p-2 text-xs">
                {task}
              </pre>
            </div>
          ) : null}

          <div>
            <div className="text-[11px] text-muted-foreground">输出</div>
            <div
              ref={outputRef}
              className="mt-1 w-full max-h-[360px] overflow-auto rounded-md bg-background py-2"
              onScroll={handleOutputScroll}
            >
              {typeof effectiveErrorText === "string" && effectiveErrorText.trim() ? (
                <pre className="whitespace-pre-wrap break-words px-3 text-xs text-destructive/80">
                  {effectiveErrorText}
                </pre>
              ) : (
                <div className="min-w-0 w-full">
                  {renderMessageParts(nestedParts as any[], { isAnimating: isStreaming })}
                </div>
              )}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
