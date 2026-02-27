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
import type { OfficeCommandAck } from "@/modules/office/officeTypes";

type PendingEntry = {
  resolve: (payload: OfficeCommandAck) => void;
  timer: NodeJS.Timeout;
  deadline: number;
  requestedAt: string;
};

type EarlyAckEntry = {
  payload: OfficeCommandAck;
  timer: NodeJS.Timeout;
  receivedAt: number;
};

const pendingByCommandId = new Map<string, PendingEntry>();
const earlyAckByCommandId = new Map<string, EarlyAckEntry>();
const EARLY_ACK_TTL_MS = 30_000;

function storeEarlyAck(payload: OfficeCommandAck): boolean {
  const commandId = payload.commandId.trim();
  if (!commandId) return false;
  if (earlyAckByCommandId.has(commandId)) return false;

  const receivedAt = Date.now();
  const timer = setTimeout(() => {
    earlyAckByCommandId.delete(commandId);
  }, EARLY_ACK_TTL_MS);

  earlyAckByCommandId.set(commandId, { payload, timer, receivedAt });
  logger.warn({ commandId }, "[office] ack arrived before pending; stored temporarily");
  return true;
}

export function waitOfficeCommandAck(input: {
  commandId: string;
  clientId: string;
  timeoutSec?: number;
  requestedAt: string;
}): Promise<OfficeCommandAck> {
  const commandId = input.commandId.trim();
  if (!commandId) throw new Error("commandId is required.");

  if (pendingByCommandId.has(commandId)) {
    throw new Error(`commandId already pending: ${commandId}`);
  }

  const earlyAck = earlyAckByCommandId.get(commandId);
  if (earlyAck) {
    clearTimeout(earlyAck.timer);
    earlyAckByCommandId.delete(commandId);
    return Promise.resolve(earlyAck.payload);
  }

  const timeoutSec = normalizeTimeoutSec(input.timeoutSec);
  const timeoutMs = timeoutSec * 1000;
  const requestedAt = input.requestedAt;

  logger.debug({ commandId, timeoutSec }, "[office] pending registered");
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setTimeout(() => {
      pendingByCommandId.delete(commandId);
      logger.warn({ commandId }, "[office] pending timeout");
      resolve({
        commandId,
        clientId: input.clientId,
        status: "timeout",
        errorText: "Office execution timeout",
        requestedAt,
      });
    }, timeoutMs);

    pendingByCommandId.set(commandId, {
      resolve,
      timer,
      deadline,
      requestedAt,
    });
  });
}

export function resolveOfficeCommandAck(
  payload: OfficeCommandAck,
): "resolved" | "stored" | "missing" {
  const commandId = payload.commandId.trim();
  if (!commandId) return "missing";

  const entry = pendingByCommandId.get(commandId);
  if (!entry) {
    const stored = storeEarlyAck(payload);
    return stored ? "stored" : "missing";
  }

  clearTimeout(entry.timer);
  pendingByCommandId.delete(commandId);
  logger.debug({ commandId, status: payload.status }, "[office] pending resolved");
  entry.resolve(payload);
  return "resolved";
}

export function normalizeTimeoutSec(timeoutSec: number | undefined): number {
  const value = Number.isFinite(timeoutSec) ? Math.floor(timeoutSec as number) : 60;
  if (value <= 0) return 60;
  if (value > 24 * 60 * 60) {
    logger.warn({ timeoutSec: value }, "office timeoutSec too large; capping to 24h");
    return 24 * 60 * 60;
  }
  return value;
}
