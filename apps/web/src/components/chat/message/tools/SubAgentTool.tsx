"use client";

import { useChatContext } from "../../ChatProvider";
import ToolInfoCard from "./shared/ToolInfoCard";
import { getToolId, getToolName, getToolStatusTone } from "./shared/tool-utils";

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
  const statusTone = getToolStatusTone({
    type: part.type ?? "tool-sub-agent",
    state: effectiveState,
    errorText: effectiveErrorText,
    output: effectiveOutput,
  });
  const isStreaming = effectiveState === "output-streaming" || stream?.streaming === true;
  const outputText = effectiveOutput;
  const hasOutput = typeof outputText === "string" && outputText.length > 0;
  const outputError =
    typeof effectiveErrorText === "string" && effectiveErrorText.trim()
      ? effectiveErrorText
      : "";
  const displayOutput = outputError || (typeof outputText === "string" ? outputText : "");
  const outputTone = outputError ? "error" : "default";

  return (
    <ToolInfoCard
      title={getToolName(part as any)}
      toolId={getToolId(part as any)}
      statusTone={statusTone}
      inputText={JSON.stringify({ name, task })}
      outputText={displayOutput || (hasOutput ? String(outputText) : "")}
      outputTone={outputTone}
      isStreaming={isStreaming}
    />
  );
}
