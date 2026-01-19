"use client";

import * as React from "react";
import ToolInfoCard from "./shared/ToolInfoCard";
import {
  getToolStatusText,
  getToolStatusTone,
  safeStringify,
} from "./shared/tool-utils";

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
  const statusText = getToolStatusText({
    type: "tool-cli",
    state: part.state,
    output: part.output,
    errorText: part.errorText,
  });
  const statusTone = getToolStatusTone({
    type: "tool-cli",
    state: part.state,
    output: part.output,
    errorText: part.errorText,
  });
  const outputText = getCliOutputText(part);
  const hasError = typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const isStreaming = part.state === "output-streaming";

  return (
    <ToolInfoCard
      title="cli-thinking"
      action={title}
      status={statusText}
      statusTone={statusTone}
      params={[
        { label: "模式", value: "CLI" },
        { label: "流式", value: isStreaming ? "是" : "否", tone: "muted" },
      ]}
      output={{
        title: "输出",
        rawText: hasError ? String(part.errorText ?? "") : outputText || safeStringify(part.output),
        tone: hasError ? "error" : "default",
        defaultOpen: true,
      }}
    />
  );
}
