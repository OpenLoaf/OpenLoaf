/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "@/components/ai-elements/terminal";
import { cn } from "@/lib/utils";
import {
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
  const isStreaming = isToolStreaming(part as any);
  const outputText = getCliOutputText(part);
  const hasError = typeof part.errorText === "string" && part.errorText.trim().length > 0;
  const normalizedOutput = hasError
    ? String(part.errorText ?? "")
    : outputText || safeStringify(part.output);

  return (
    <div className="ml-2 w-full min-w-0 max-w-[90%]">
      <Terminal output={normalizedOutput} isStreaming={isStreaming}>
        <TerminalHeader>
          <TerminalTitle>{title}</TerminalTitle>
          <div className="flex items-center gap-1">
            {hasError ? (
              <span className="text-destructive text-xs">失败</span>
            ) : (
              <TerminalStatus />
            )}
            <TerminalActions>
              <TerminalCopyButton />
            </TerminalActions>
          </div>
        </TerminalHeader>
        <TerminalContent
          className={cn(
            "max-h-72 text-xs",
            hasError ? "text-red-300" : undefined,
          )}
        />
      </Terminal>
    </div>
  );
}
