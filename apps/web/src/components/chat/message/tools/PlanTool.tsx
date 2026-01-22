"use client";

import ToolInfoCard from "./shared/ToolInfoCard";
import {
  asPlainObject,
  getToolId,
  getToolName,
  getToolStatusTone,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
} from "./shared/tool-utils";
import type { AnyToolPart } from "./shared/tool-utils";

function stripActionName(value: unknown): unknown {
  const inputObject = asPlainObject(value);
  if (!inputObject) return value;
  const { actionName: _actionName, ...rest } = inputObject;
  return rest;
}

function stringifyRaw(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Render update-plan tool message. */
export default function PlanTool({ part, className }: { part: AnyToolPart; className?: string }) {
  const normalizedInput = normalizeToolInput(part.input);
  const statusTone = getToolStatusTone(part);
  const isStreaming = isToolStreaming(part);
  const hasError =
    typeof part.errorText === "string" && part.errorText.trim().length > 0;

  return (
    <ToolInfoCard
      title={getToolName(part)}
      toolId={getToolId(part)}
      statusTone={statusTone}
      inputText={stringifyRaw(stripActionName(normalizedInput))}
      outputText={hasError ? String(part.errorText ?? "") : stringifyRaw(part.output ?? "")}
      outputTone={hasError ? "error" : "default"}
      showOutput={!hasError && Boolean(part.output)}
      isStreaming={isStreaming}
      className={className}
    />
  );
}
