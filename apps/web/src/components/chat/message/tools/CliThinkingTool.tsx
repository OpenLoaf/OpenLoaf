"use client";

import * as React from "react";
import ToolInfoCard from "./shared/ToolInfoCard";
import {
  getToolId,
  getToolStatusTone,
  isToolStreaming,
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
  errorText?: string | null;
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
  const statusTone = getToolStatusTone({
    type: "tool-cli",
    state: part.state,
    output: part.output,
    errorText: part.errorText,
  });
  const isStreaming = isToolStreaming(part as any);
  const outputText = getCliOutputText(part);
  const hasError = typeof part.errorText === "string" && part.errorText.trim().length > 0;

  return (
    <ToolInfoCard
      title={title}
      toolId={getToolId(part as any)}
      statusTone={statusTone}
      inputText=""
      outputText={hasError ? String(part.errorText ?? "") : outputText || safeStringify(part.output)}
      outputTone={hasError ? "error" : "default"}
      showOutput={hasError || Boolean(outputText || part.output)}
      isStreaming={isStreaming}
    />
  );
}
