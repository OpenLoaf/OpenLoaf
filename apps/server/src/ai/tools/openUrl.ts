/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from "ai";
import { openUrlToolDef } from "@openloaf/api/types/tools/browser";
import { requireTabId } from "@/common/tabContext";
import { getSessionId, getClientId, getTabId } from "@/ai/shared/context/requestContext";
import {
  normalizeTimeoutSec,
  registerFrontendToolPending,
} from "@/ai/tools/pendingRegistry";
import { standaloneBrowserTargetStore } from "@/modules/tab/TabSnapshotStoreAdapter";

/**
 * Opens a URL in the in-app browser panel via frontend execution.
 */
export const openUrlTool = tool({
  description: openUrlToolDef.description,
  inputSchema: zodSchema(openUrlToolDef.parameters),
  execute: async (input, options) => {
    const toolCallId = options.toolCallId;
    if (!toolCallId) throw new Error("toolCallId is required.");
    requireTabId();
    const timeoutSec = typeof (input as { timeoutSec?: unknown })?.timeoutSec === "number"
      ? (input as { timeoutSec?: number }).timeoutSec
      : undefined;
    const url = typeof (input as { url?: unknown })?.url === "string"
      ? String((input as { url?: string }).url)
      : "";
    const waitTimeoutSec = normalizeTimeoutSec(timeoutSec);
    const result = await registerFrontendToolPending({
      toolCallId,
      timeoutSec: waitTimeoutSec,
    });
    if (result.status === "success") {
      // 如果前端返回了 cdpTargetId（独立浏览器窗口），写入 standalone store
      // 供后续 BrowserWait/BrowserSnapshot 等工具使用。
      const output = result.output as Record<string, unknown> | undefined;
      const cdpTargetId = typeof output?.cdpTargetId === "string"
        ? String(output.cdpTargetId).trim()
        : "";
      if (cdpTargetId) {
        const sessionId = getSessionId();
        const clientId = getClientId();
        const tabId = getTabId();
        if (sessionId && clientId && tabId) {
          standaloneBrowserTargetStore.set({ sessionId, clientId, tabId, cdpTargetId, url });
        }
      }
      return result;
    }
    if (result.status === "timeout") {
      throw new Error("OpenUrl timeout");
    }
    throw new Error(result.errorText || "OpenUrl failed");
  },
});
