/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { tool, zodSchema } from "ai";
import { v4 as uuidv4 } from "uuid";
import { officeExecuteToolDef } from "@openloaf/api/types/tools/office";
import { getProjectId, getWorkspaceId } from "@/ai/shared/context/requestContext";
import { selectOfficeClient, waitForOfficeClient } from "@/modules/office/officeRegistry";
import { publishOfficeCommand } from "@/modules/office/officeEvents";
import { waitOfficeCommandAck } from "@/modules/office/officePending";
import { registerFrontendToolPending, normalizeTimeoutSec } from "@/ai/tools/pendingRegistry";
import type {
  OfficeAction,
  OfficeAppType,
  OfficeCommandPayload,
} from "@/modules/office/officeTypes";

function resolveWorkspaceId(input: { workspaceId?: string }) {
  const raw = typeof input.workspaceId === "string" ? input.workspaceId.trim() : "";
  return raw || getWorkspaceId() || undefined;
}

function resolveProjectId(input: { projectId?: string }) {
  const raw = typeof input.projectId === "string" ? input.projectId.trim() : "";
  return raw || getProjectId() || undefined;
}

export const officeExecuteTool = tool({
  description: officeExecuteToolDef.description,
  inputSchema: zodSchema(officeExecuteToolDef.parameters),
  execute: async (input, options) => {
    const appType = (input as { appType?: OfficeAppType }).appType ?? "docx";
    const action = (input as { action: OfficeAction }).action;
    const payload = (input as { payload?: OfficeCommandPayload }).payload ?? {};
    const workspaceId = resolveWorkspaceId(input as { workspaceId?: string });
    const projectId = resolveProjectId(input as { projectId?: string });
    const timeoutSec =
      typeof (input as { timeoutSec?: number }).timeoutSec === "number"
        ? (input as { timeoutSec?: number }).timeoutSec
        : undefined;

    const toolCallId = options.toolCallId;
    if (!toolCallId) throw new Error("toolCallId is required.");
    const waitTimeoutSec = normalizeTimeoutSec(timeoutSec);

    const frontendResult = await registerFrontendToolPending({
      toolCallId,
      timeoutSec: waitTimeoutSec,
    });
    if (frontendResult.status === "timeout") {
      throw new Error("office-execute open timeout");
    }
    if (frontendResult.status !== "success") {
      throw new Error(frontendResult.errorText || "office-execute open failed");
    }

    const client =
      selectOfficeClient({ appType, workspaceId, projectId }) ||
      (await waitForOfficeClient({
        appType,
        workspaceId,
        projectId,
        timeoutSec: waitTimeoutSec,
      }));
    if (!client) throw new Error("No office client available");
    if (client.capabilities?.length && !client.capabilities.includes(action)) {
      throw new Error(`Office client does not support action: ${action}`);
    }

    const commandId = toolCallId || uuidv4();
    const requestedAt = new Date().toISOString();
    publishOfficeCommand({
      commandId,
      clientId: client.clientId,
      appType,
      action,
      payload,
      context: {
        workspaceId,
        projectId,
        requestedAt,
      },
      timeoutSec,
    });

    const ack = await waitOfficeCommandAck({
      commandId,
      clientId: client.clientId,
      timeoutSec,
      requestedAt,
    });

    if (ack.status === "success") return ack;
    if (ack.status === "timeout") {
      throw new Error("office-execute timeout");
    }
    throw new Error(ack.errorText || "office-execute failed");
  },
});
