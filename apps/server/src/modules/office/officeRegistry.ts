/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { v4 as uuidv4 } from "uuid";
import {
  OFFICE_ACTIONS,
  type OfficeAction,
  type OfficeAppType,
  type OfficeClient,
} from "@/modules/office/officeTypes";

const OFFICE_CLIENT_TTL_MS = 90_000;
const clientsById = new Map<string, OfficeClient>();

export function registerOfficeClient(input: {
  appType: OfficeAppType;
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
    projectId: input.projectId,
    capabilities,
    clientMeta: input.clientMeta,
    lastHeartbeat: now,
  };
  clientsById.set(clientId, client);
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
