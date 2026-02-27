/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { logger } from "@/common/logger";

type FrontendToolAckStatus = "success" | "failed" | "timeout";

type FrontendToolAckPayload = {
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

type EarlyAckEntry = {
  payload: FrontendToolAckPayload;
  timer: NodeJS.Timeout;
  receivedAt: number;
};

const pendingByToolCallId = new Map<string, PendingEntry>();
const earlyAckByToolCallId = new Map<string, EarlyAckEntry>();

const EARLY_ACK_TTL_MS = 30_000;

/** Store an early ack when pending hasn't been registered yet. */
function storeEarlyAck(payload: FrontendToolAckPayload): boolean {
  const toolCallId = payload.toolCallId.trim();
  if (!toolCallId) return false;
  if (earlyAckByToolCallId.has(toolCallId)) return false;

  const receivedAt = Date.now();
  const timer = setTimeout(() => {
    // 中文注释：超时清理早到回执，避免长期占用内存。
    earlyAckByToolCallId.delete(toolCallId);
  }, EARLY_ACK_TTL_MS);

  earlyAckByToolCallId.set(toolCallId, { payload, timer, receivedAt });
  logger.warn({ toolCallId }, "[frontend-tool] ack arrived before pending; stored temporarily");
  return true;
}

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

  const earlyAck = earlyAckByToolCallId.get(toolCallId);
  if (earlyAck) {
    clearTimeout(earlyAck.timer);
    earlyAckByToolCallId.delete(toolCallId);
    // 中文注释：先收到回执时，直接返回，避免进入等待超时。
    return Promise.resolve(earlyAck.payload);
  }

  const timeoutSec = normalizeTimeoutSec(input.timeoutSec);
  const timeoutMs = timeoutSec * 1000;
  const requestedAt = new Date().toISOString();

  logger.debug({ toolCallId, timeoutSec }, "[frontend-tool] pending registered");
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setTimeout(() => {
      // 中文注释：超时后必须清理 pending，避免内存泄漏。
      pendingByToolCallId.delete(toolCallId);
      logger.warn({ toolCallId }, "[frontend-tool] pending timeout");
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
export function resolveFrontendToolPending(
  payload: FrontendToolAckPayload,
): "resolved" | "stored" | "missing" {
  const toolCallId = payload.toolCallId.trim();
  if (!toolCallId) return "missing";

  const entry = pendingByToolCallId.get(toolCallId);
  if (!entry) {
    const stored = storeEarlyAck(payload);
    return stored ? "stored" : "missing";
  }

  clearTimeout(entry.timer);
  pendingByToolCallId.delete(toolCallId);
  logger.debug({ toolCallId, status: payload.status }, "[frontend-tool] pending resolved");
  entry.resolve(payload);
  return "resolved";
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
