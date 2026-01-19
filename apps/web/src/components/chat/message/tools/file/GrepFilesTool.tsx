"use client";

import ToolInfoCard from "../shared/ToolInfoCard";
import {
  asPlainObject,
  formatValue,
  getToolName,
  getToolOutputState,
  getToolStatusText,
  getToolStatusTone,
  normalizeToolInput,
  safeStringify,
} from "../shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface GrepFilesToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render grep-files tool output. */
export default function GrepFilesTool({ part, className }: GrepFilesToolProps) {
  const statusText = getToolStatusText(part);
  const statusTone = getToolStatusTone(part);
  const input = asPlainObject(normalizeToolInput(part.input)) ?? {};
  const params = [
    { label: "匹配", value: formatValue(input.pattern), mono: true },
    { label: "范围", value: formatValue(input.path), mono: true },
    { label: "包含", value: formatValue(input.include) },
    { label: "数量", value: formatValue(input.limit) },
  ];

  const outputText = safeStringify(part.output);
  const lineCount = outputText ? outputText.split("\n").length : 0;
  const { hasErrorText } = getToolOutputState(part);

  return (
    <ToolInfoCard
      title={getToolName(part)}
      action="搜索文件"
      status={statusText}
      statusTone={statusTone}
      params={params}
      className={className}
      isRejected={part.approval?.approved === false}
      output={{
        title: "输出",
        summaryRows: [
          lineCount > 0 ? { label: "条目", value: String(lineCount), tone: "muted" } : null,
        ].filter(Boolean) as { label: string; value: string; tone?: "default" | "muted" | "danger" }[],
        rawText: hasErrorText ? String(part.errorText ?? "") : outputText,
        tone: hasErrorText ? "error" : "default",
        defaultOpen: hasErrorText,
      }}
    />
  );
}
