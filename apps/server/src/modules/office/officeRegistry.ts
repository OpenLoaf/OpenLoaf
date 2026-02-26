/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/common/logger";
import {
  OFFICE_ACTIONS,
  type OfficeAction,
  type OfficeAppType,
  type OfficeClient,
} from "@/modules/office/officeTypes";
import { normalizeTimeoutSec } from "@/modules/office/officePending";

const OFFICE_CLIENT_TTL_MS = 90_000;
const clientsById = new Map<string, OfficeClient>();
const clientEventBus = new EventEmitter();

function isExpired(client: OfficeClient, now = Date.now()) {
  return now - client.lastHeartbeat > OFFICE_CLIENT_TTL_MS;
}

export function registerOfficeClient(input: {
  appType: OfficeAppType;
  workspaceId?: string;
  projectId?: string;
  capabilities?: OfficeAction[];
  clientMeta?: Record<string, unknown>;
}): { clientId: string; leaseExpiresAt: string } {
  const now = Date.now();
  const clientId = uuidv4();
  const capabilities = input.capabilities?.length
    ? input.capabilities
    : [...OFFICE_ACTIONS];
  const client: OfficeClient = {
    clientId,
    appType: input.appType,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    capabilities,
    clientMeta: input.clientMeta,
    lastHeartbeat: now,
  };
  clientsById.set(clientId, client);
  clientEventBus.emit("registered", client);
  return {
    clientId,
    leaseExpiresAt: new Date(now + OFFICE_CLIENT_TTL_MS).toISOString(),
  };
}

export function heartbeatOfficeClient(clientId: string): boolean {
  const client = clientsById.get(clientId);
  if (!client) return false;
  client.lastHeartbeat = Date.now();
  return true;
}

export function getOfficeClient(clientId: string): OfficeClient | null {
  const client = clientsById.get(clientId);
  if (!client) return null;
  if (isExpired(client)) {
    clientsById.delete(clientId);
    return null;
  }
  return client;
}

export function cleanupExpiredOfficeClients(): number {
  const now = Date.now();
  let removed = 0;
  for (const [clientId, client] of clientsById.entries()) {
    if (isExpired(client, now)) {
      clientsById.delete(clientId);
      removed += 1;
    }
  }
  if (removed > 0) {
    logger.debug({ removed }, "[office] cleaned up expired clients");
  }
  return removed;
}

export function selectOfficeClient(input: {
  appType: OfficeAppType;
  workspaceId?: string;
  projectId?: string;
}): OfficeClient | null {
  cleanupExpiredOfficeClients();
  const candidates = Array.from(clientsById.values()).filter(
    (client) => client.appType === input.appType,
  );
  if (!candidates.length) return null;

  let filtered = candidates;
  if (input.workspaceId || input.projectId) {
    const exact = candidates.filter(
      (client) =>
        client.workspaceId === input.workspaceId &&
        client.projectId === input.projectId,
    );
    if (exact.length) filtered = exact;
  }

  filtered.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat);
  return filtered[0] ?? null;
}

export function waitForOfficeClient(input: {
  appType: OfficeAppType;
  workspaceId?: string;
  projectId?: string;
  timeoutSec?: number;
}): Promise<OfficeClient | null> {
  const existing = selectOfficeClient(input);
  if (existing) return Promise.resolve(existing);

  const timeoutSec = normalizeTimeoutSec(input.timeoutSec);
  const timeoutMs = timeoutSec * 1000;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      clientEventBus.off("registered", handler);
      resolve(null);
    }, timeoutMs);

    const handler = (client: OfficeClient) => {
      if (client.appType !== input.appType) return;
      if (input.workspaceId && client.workspaceId !== input.workspaceId) return;
      if (input.projectId && client.projectId !== input.projectId) return;
      clearTimeout(timer);
      clientEventBus.off("registered", handler);
      resolve(client);
    };

    clientEventBus.on("registered", handler);
  });
}
