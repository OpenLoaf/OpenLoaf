export type CodexMode = "chat" | "agent" | "agent_full_access";

export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type CodexRequestOptions = {
  /** Codex execution mode. */
  mode?: CodexMode;
  /** Codex reasoning effort. */
  reasoningEffort?: CodexReasoningEffort;
};

/** Default Codex mode. */
export const DEFAULT_CODEX_MODE: CodexMode = "chat";
/** Default Codex reasoning effort. */
export const DEFAULT_CODEX_REASONING_EFFORT: CodexReasoningEffort = "medium";

/** Normalize codex mode from unknown input. */
function normalizeCodexMode(value: unknown): CodexMode | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "chat" || trimmed === "agent" || trimmed === "agent_full_access") {
    return trimmed;
  }
  return undefined;
}

/** Normalize codex reasoning effort from unknown input. */
function normalizeCodexReasoningEffort(
  value: unknown,
): CodexReasoningEffort | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "low" || trimmed === "medium" || trimmed === "high" || trimmed === "xhigh") {
    return trimmed;
  }
  return undefined;
}

/** Normalize codex request options from unknown input. */
export function normalizeCodexOptions(value: unknown): CodexRequestOptions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const mode = normalizeCodexMode(raw.mode);
  const reasoningEffort = normalizeCodexReasoningEffort(raw.reasoningEffort);
  if (!mode && !reasoningEffort) return undefined;
  return {
    ...(mode ? { mode } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}
