export type CodexThreadKeyInput = {
  /** Chat session id. */
  sessionId: string;
  /** Provider id. */
  providerId: string;
  /** Model id. */
  modelId: string;
};

export type CodexThreadEntry = CodexThreadKeyInput & {
  /** Codex thread id. */
  threadId: string;
};

/** In-memory thread store keyed by session and model. */
const THREAD_STORE = new Map<string, string>();

/** Build the cache key for a codex thread. */
function buildThreadKey(input: CodexThreadKeyInput): string {
  // 逻辑：按会话 + provider + model 维度缓存，避免跨模型串线。
  return `${input.sessionId}:${input.providerId}:${input.modelId}`;
}

/** Read a stored thread id for the given session + model. */
export function getCodexThreadId(input: CodexThreadKeyInput): string | null {
  const key = buildThreadKey(input);
  return THREAD_STORE.get(key) ?? null;
}

/** Persist a thread id for the given session + model. */
export function setCodexThreadId(input: CodexThreadEntry): void {
  const key = buildThreadKey(input);
  THREAD_STORE.set(key, input.threadId);
}

/** Clear a stored thread id for the given session + model. */
export function clearCodexThreadId(input: CodexThreadKeyInput): void {
  const key = buildThreadKey(input);
  THREAD_STORE.delete(key);
}
