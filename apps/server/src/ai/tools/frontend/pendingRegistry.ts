import { logger } from "@/common/logger";

export type FrontendToolAckStatus = "success" | "failed" | "timeout";

export type FrontendToolAckPayload = {
  toolCallId: string;
  status: FrontendToolAckStatus;
  output?: unknown;
  errorText?: string | null;
  requestedAt: string;
};

type PendingEntry = {
  resolve: (payload: FrontendToolAckPayload) => void;
  timer: NodeJS.Timeout;
  deadline: number;
  requestedAt: string;
};

const pendingByToolCallId = new Map<string, PendingEntry>();

/** Register a pending frontend tool execution and await the ack. */
export function registerFrontendToolPending(input: {
  toolCallId: string;
  timeoutSec: number;
}): Promise<FrontendToolAckPayload> {
  const toolCallId = input.toolCallId.trim();
  if (!toolCallId) throw new Error("toolCallId is required.");

  if (pendingByToolCallId.has(toolCallId)) {
    throw new Error(`toolCallId already pending: ${toolCallId}`);
  }

  const timeoutSec = normalizeTimeoutSec(input.timeoutSec);
  const timeoutMs = timeoutSec * 1000;
  const requestedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setTimeout(() => {
      // 中文注释：超时后必须清理 pending，避免内存泄漏。
      pendingByToolCallId.delete(toolCallId);
      resolve({
        toolCallId,
        status: "timeout",
        errorText: "Frontend execution timeout",
        requestedAt,
      });
    }, timeoutMs);

    pendingByToolCallId.set(toolCallId, {
      resolve,
      timer,
      deadline,
      requestedAt,
    });
  });
}

/** Resolve a pending frontend tool execution by toolCallId. */
export function resolveFrontendToolPending(payload: FrontendToolAckPayload): boolean {
  const toolCallId = payload.toolCallId.trim();
  if (!toolCallId) return false;

  const entry = pendingByToolCallId.get(toolCallId);
  if (!entry) return false;

  clearTimeout(entry.timer);
  pendingByToolCallId.delete(toolCallId);
  entry.resolve(payload);
  return true;
}

/** Check whether a toolCallId is currently pending. */
export function hasFrontendToolPending(toolCallId: string): boolean {
  return pendingByToolCallId.has(toolCallId.trim());
}

/** Normalize timeout seconds with guardrails. */
export function normalizeTimeoutSec(timeoutSec: number | undefined): number {
  const value = Number.isFinite(timeoutSec) ? Math.floor(timeoutSec as number) : 60;
  if (value <= 0) return 60;
  if (value > 24 * 60 * 60) {
    logger.warn({ timeoutSec: value }, "frontend tool timeoutSec too large; capping to 24h");
    return 24 * 60 * 60;
  }
  return value;
}
