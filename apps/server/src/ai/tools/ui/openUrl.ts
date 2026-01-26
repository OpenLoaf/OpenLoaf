import { tool, zodSchema } from "ai";
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import { requireTabId } from "@/common/tabContext";
import {
  normalizeTimeoutSec,
  registerFrontendToolPending,
} from "@/ai/tools/frontend/pendingRegistry";

/**
 * Opens a URL in the in-app browser panel via frontend execution.
 */
export const openUrlTool = tool({
  description: openUrlToolDef.description,
  inputSchema: zodSchema(openUrlToolDef.parameters),
  execute: async ({ timeoutSec }, options) => {
    const toolCallId = options.toolCallId;
    if (!toolCallId) throw new Error("toolCallId is required.");
    requireTabId();
    const waitTimeoutSec = normalizeTimeoutSec(timeoutSec);
    return registerFrontendToolPending({ toolCallId, timeoutSec: waitTimeoutSec });
  },
});
