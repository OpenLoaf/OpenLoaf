import { tool, zodSchema } from "ai";
import { subAgentToolDef, type SubAgentToolOutput } from "@teatime-ai/api/types/tools/subAgent";
import { runSubAgentStreaming } from "@/ai/runners/subAgentRunner";
import { logger } from "@/common/logger";

/**
 * Normalizes sub-agent name from user input (MVP).
 */
function normalizeSubAgentName(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Runs a sub-agent and streams its output as a tool output stream (MVP).
 */
export const subAgentTool = tool({
  description: subAgentToolDef.description,
  inputSchema: zodSchema(subAgentToolDef.parameters),
  execute: async function* ({ name, task }, options): AsyncIterable<SubAgentToolOutput> {
    const subAgentName = normalizeSubAgentName(name);
    const subTask = task.trim();
    if (!subAgentName) throw new Error("sub-agent name is required");
    if (!subTask) throw new Error("sub-agent task is required");

    logger.debug({ subAgentName, toolCallId: options.toolCallId }, "[ai] sub-agent start");

    for await (const progress of runSubAgentStreaming({
      name: subAgentName,
      task: subTask,
      abortSignal: options.abortSignal,
    })) {
      yield { ok: true, data: progress.payload };
    }

    logger.debug({ subAgentName, toolCallId: options.toolCallId }, "[ai] sub-agent done");
  },
});
