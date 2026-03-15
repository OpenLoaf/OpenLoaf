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
