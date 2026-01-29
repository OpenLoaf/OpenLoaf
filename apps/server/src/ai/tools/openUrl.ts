import { tool, zodSchema } from "ai";
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import { requireTabId } from "@/common/tabContext";
import {
  normalizeTimeoutSec,
  registerFrontendToolPending,
} from "@/ai/tools/pendingRegistry";

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
    if (result.status === "success") return result;
    if (result.status === "timeout") {
      throw new Error("open-url timeout");
    }
    throw new Error(result.errorText || "open-url failed");
  },
});
