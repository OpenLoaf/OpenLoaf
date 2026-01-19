"use client";

import ToolApprovalPrompt from "../shared/ToolApprovalPrompt";
import {
  asPlainObject,
  extractOutputSection,
  formatValue,
  getToolOutputState,
  normalizeToolInput,
  safeStringify,
} from "../shared/tool-utils";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ListDirToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render list-dir tool output. */
export default function ListDirTool({ part, className }: ListDirToolProps) {
  const input = asPlainObject(normalizeToolInput(part.input)) ?? {};
  const path = formatValue(input.path) || "—";
  const depth = formatValue(input.depth);
  const offset = formatValue(input.offset);
  const limit = formatValue(input.limit);
  const rangeParts = [
    depth !== "—" ? `深度：${depth}` : null,
    offset !== "—" ? `偏移：${offset}` : null,
    limit !== "—" ? `数量：${limit}` : null,
  ].filter(Boolean);

  const { hasErrorText } = getToolOutputState(part);
  const rawOutput = extractOutputSection(safeStringify(part.output));
  const outputText = hasErrorText
    ? String(part.errorText ?? "")
    : rawOutput || (part.state ? `（${part.state}）` : "");

  return (
    <ToolApprovalPrompt
      action="需要列出目录"
      primary={path}
      secondary={rangeParts.length > 0 ? rangeParts.join("，") : undefined}
      className={className}
      isApprovalRequested={false}
      isRejected={false}
      output={outputText || "（无输出）"}
      outputTone={hasErrorText ? "error" : "default"}
    />
  );
}
