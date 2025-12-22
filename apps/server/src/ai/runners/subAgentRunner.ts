import { createAgentUIStream, generateId, type UIMessage } from "ai";
import { ToolLoopAgent } from "ai";
import { buildSubAgentSystemPrompt } from "@/ai/prompts/subAgentPromptBuilder";
import { logger } from "@/common/logger";
import { getAbortSignal, getCurrentAgentFrame, popAgentFrame, pushAgentFrame, type AgentFrame } from "@/common/requestContext";
import { xaiOpenAI } from "@/ai/xaiOpenAI";

export type SubAgentRunProgress = {
  text: string;
  done: boolean;
};

/**
 * Creates a request-context frame for a sub-agent run (MVP).
 */
function createSubAgentFrame(input: { name: string }): AgentFrame {
  const parent = getCurrentAgentFrame();
  return {
    kind: "sub",
    name: input.name,
    agentId: `sub-agent:${input.name}`,
    path: [...(parent?.path ?? []), input.name],
    model: { provider: "xai", modelId: "grok-4-1-fast-reasoning" },
  };
}

/**
 * Reads a sub-agent UI stream and yields aggregated text progress (MVP).
 */
async function* readSubAgentTextStream(input: { stream: ReadableStream<any>; abortSignal?: AbortSignal }) {
  let text = "";
  let lastEmitLength = 0;
  const minDeltaChars = 80;

  const reader = input.stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        yield { text, done: true } satisfies SubAgentRunProgress;
        return;
      }

      if (input.abortSignal?.aborted) {
        yield { text, done: true } satisfies SubAgentRunProgress;
        return;
      }
      if (!value || typeof value !== "object") continue;

      if (value.type === "error") {
        throw new Error(String(value.errorText || "sub-agent stream error"));
      }

      if (value.type === "text-delta" && typeof value.delta === "string") {
        text += value.delta;
        const shouldEmit = text.length - lastEmitLength >= minDeltaChars;
        if (shouldEmit) {
          lastEmitLength = text.length;
          yield { text, done: false } satisfies SubAgentRunProgress;
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/**
 * Runs a sub-agent by name and streams its text output (MVP).
 */
export async function* runSubAgentStreaming(input: { name: string; task: string; abortSignal?: AbortSignal }) {
  const name = input.name.trim();
  const task = input.task.trim();
  if (!name) throw new Error("sub-agent name is required");
  if (!task) throw new Error("sub-agent task is required");

  // 优先复用主请求的 abortSignal（stop 会中止 MasterAgent + SubAgent）。
  const abortSignal = input.abortSignal ?? getAbortSignal();

  // MVP 先统一用 grok-4-1-fast-reasoning + 无工具 SubAgent，把“sub-agent tool 输出流”链路跑通。
  const agent = new ToolLoopAgent({
    model: xaiOpenAI("grok-4-1-fast-reasoning"),
    instructions: buildSubAgentSystemPrompt({ name }),
    tools: {},
  });

  const subAgentMessageId = generateId();
  const messages: UIMessage[] = [
    {
      id: subAgentMessageId,
      role: "user",
      parts: [{ type: "text", text: task }],
    } as any,
  ];

  const frame = createSubAgentFrame({ name });
  pushAgentFrame(frame);
  logger.debug({ subAgentName: name }, "[ai] sub-agent start");

  try {
    const stream = await createAgentUIStream({
      agent,
      messages: messages as any[],
      abortSignal,
      generateMessageId: () => generateId(),
    });

    // 把 SubAgent 的 text-delta 聚合成“渐进文本”，作为上层 tool output 的流式内容。
    for await (const progress of readSubAgentTextStream({ stream: stream as any, abortSignal })) {
      yield progress;
    }
    logger.debug({ subAgentName: name }, "[ai] sub-agent done");
  } finally {
    popAgentFrame();
  }
}
