import { tool, zodSchema } from "ai";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { runSubAgentStreaming } from "@/ai/runners/subAgentRunner";
import { logger } from "@/common/logger";

type SubAgentToolOutput = {
  ok: true;
  data: {
    workerName: string;
    done: boolean;
    text: string;
  };
};

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

    // sub-agent 的输出必须出现在“同一条 SSE 的 tool output stream”里；这里通过 AsyncIterable 实现渐进输出。
    let text = "";
    yield { ok: true, data: { workerName: subAgentName, done: false, text } };

    logger.debug({ subAgentName, toolCallId: options.toolCallId }, "[ai] sub-agent start");

    for await (const progress of runSubAgentStreaming({
      name: subAgentName,
      task: subTask,
      abortSignal: options.abortSignal,
    })) {
      text = progress.text;
      yield { ok: true, data: { workerName: subAgentName, done: progress.done, text } };
    }

    logger.debug({ subAgentName, toolCallId: options.toolCallId }, "[ai] sub-agent done");
  },
});
