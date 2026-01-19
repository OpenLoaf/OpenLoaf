"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import type { ToolPartSnapshot } from "@/hooks/use-tabs";
import { resolveToolDisplayName } from "@/lib/chat/tool-name";

function safeStringify(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(text: string, maxChars = 20_000) {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n…(truncated)`, truncated: true };
}

function isEmpty(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

export default function ToolResultPanel({
  tabId,
  toolKey,
  className,
}: {
  tabId?: string;
  toolKey?: string;
  className?: string;
}) {
  const part = useTabs((s) =>
    tabId && toolKey ? s.toolPartsByTabId[tabId]?.[toolKey] : undefined,
  );

  const title = part
    ? resolveToolDisplayName({
        title: part.title,
        toolName: part.toolName,
        type: part.type,
      })
    : "Tool Result";
  const inputText = safeStringify(part?.input);
  const outputText = safeStringify(part?.output ?? part?.errorText ?? "");
  const inputDisplay = truncate(inputText);
  const outputDisplay = truncate(outputText);

  return (
    <div className={cn("flex h-full w-full flex-col gap-3 p-2", className)}>
      <div className="text-sm font-semibold">{title}</div>

      {!part ? (
        <div className="text-xs text-muted-foreground">Waiting for tool output…</div>
      ) : (
        <>
          {!isEmpty(part.input) ? (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Input</div>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed">
                {inputDisplay.text}
              </pre>
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">
              Output{outputDisplay.truncated ? " (truncated)" : ""}
            </div>
            <pre className="flex-1 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed">
              {outputDisplay.text || "（暂无返回结果）"}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
