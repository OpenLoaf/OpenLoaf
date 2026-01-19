"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { renderMessageParts } from "../renderMessageParts";
import { useChatContext } from "../../ChatProvider";
import ToolInfoCard from "./shared/ToolInfoCard";
import { getToolStatusTone } from "./shared/tool-utils";

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
  const statusTone = getToolStatusTone({
    type: part.type ?? "tool-sub-agent",
    state: effectiveState,
    errorText: effectiveErrorText,
    output: effectiveOutput,
  });
  const isStreaming = effectiveState === "output-streaming";
  const outputText = effectiveOutput;
  const hasOutput = typeof outputText === "string" && outputText.length > 0;

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

  const outputBody = (
    <div
      ref={outputRef}
      className="max-h-[360px] overflow-auto rounded-md bg-muted/30 p-2"
      onScroll={handleOutputScroll}
    >
      {typeof effectiveErrorText === "string" && effectiveErrorText.trim() ? (
        <pre className="whitespace-pre-wrap break-words px-2 text-xs text-destructive/80">
          {effectiveErrorText}
        </pre>
      ) : !hasOutput ? (
        <div className="px-2 py-1 text-xs">
          {/* 中文注释：子Agent输出未开始时显示占位文案。 */}
          <span className={cn(isStreaming && "tenas-thinking-scan")}>正在思考中</span>
        </div>
      ) : (
        <div className="min-w-0 w-full">
          {renderMessageParts(nestedParts as any[], { isAnimating: isStreaming })}
        </div>
      )}
    </div>
  );

  return (
    <ToolInfoCard
      title="sub-agent"
      action={`执行子任务：${name}`}
      status={statusText}
      statusTone={statusTone}
      params={[
        { label: "子Agent", value: name },
        { label: "任务", value: task || "—" },
      ]}
      output={{
        title: "输出",
        body: outputBody,
        collapsible: true,
        defaultOpen: true,
      }}
    />
  );
}
