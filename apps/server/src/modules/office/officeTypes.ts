/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nexport const OFFICE_APP_TYPES = ["docx", "excel", "ppt"] as const;
export type OfficeAppType = (typeof OFFICE_APP_TYPES)[number];

export const OFFICE_ACTIONS = [
  "open",
  "readText",
  "replaceText",
  "insertAtCursor",
] as const;
export type OfficeAction = (typeof OFFICE_ACTIONS)[number];

export type OfficeCommandPayload = {
  filePath?: string;
  text?: string;
};

export type OfficeCommandContext = {
  workspaceId?: string;
  projectId?: string;
  requestedAt: string;
};

export type OfficeCommand = {
  commandId: string;
  clientId: string;
  appType: OfficeAppType;
  action: OfficeAction;
  payload: OfficeCommandPayload;
  context: OfficeCommandContext;
  timeoutSec?: number;
};

export type OfficeCommandAckStatus = "success" | "failed" | "timeout";

export type OfficeCommandAck = {
  commandId: string;
  clientId: string;
  status: OfficeCommandAckStatus;
  output?: {
    text?: string;
    docName?: string;
  };
  errorText?: string | null;
  requestedAt: string;
};

export type OfficeClient = {
  clientId: string;
  appType: OfficeAppType;
  workspaceId?: string;
  projectId?: string;
  capabilities: OfficeAction[];
  clientMeta?: Record<string, unknown>;
  lastHeartbeat: number;
};
