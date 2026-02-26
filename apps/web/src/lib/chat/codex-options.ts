/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

export type CodexMode = "chat" | "agent" | "agent_full_access";

export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type CodexOptions = {
  /** Codex execution mode. */
  mode?: CodexMode;
  /** Codex reasoning effort. */
  reasoningEffort?: CodexReasoningEffort;
};

/** Default Codex mode. */
export const DEFAULT_CODEX_MODE: CodexMode = "chat";
/** Default Codex reasoning effort. */
export const DEFAULT_CODEX_REASONING_EFFORT: CodexReasoningEffort = "medium";

const CODEX_MODE_VALUES = new Set<CodexMode>([
  "chat",
  "agent",
  "agent_full_access",
]);
const CODEX_EFFORT_VALUES = new Set<CodexReasoningEffort>([
  "low",
  "medium",
  "high",
  "xhigh",
]);

/** Normalize Codex options with safe defaults. */
export function normalizeCodexOptions(value?: CodexOptions): CodexOptions {
  const mode = value?.mode && CODEX_MODE_VALUES.has(value.mode) ? value.mode : undefined;
  const reasoningEffort =
    value?.reasoningEffort && CODEX_EFFORT_VALUES.has(value.reasoningEffort)
      ? value.reasoningEffort
      : undefined;
  return {
    mode: mode ?? DEFAULT_CODEX_MODE,
    reasoningEffort: reasoningEffort ?? DEFAULT_CODEX_REASONING_EFFORT,
  };
}
