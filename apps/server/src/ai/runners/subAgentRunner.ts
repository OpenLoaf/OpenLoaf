import { createAgentUIStream, generateId, type UIMessage } from "ai";
import { ToolLoopAgent } from "ai";
import type { SubAgentStreamPart, SubAgentStreamPayload } from "@teatime-ai/api/types/tools/subAgent";
import { buildSubAgentSystemPrompt } from "@/ai/prompts/subAgentPromptBuilder";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { toolPacks } from "@/ai/registry/toolPacks";
import { createBrowserSubAgent } from "@/ai/agents/subAgent/createBrowserSubAgent";
import { createTestSubAgent } from "@/ai/agents/subAgent/createTestSubAgent";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { logger } from "@/common/logger";
import {
  getAbortSignal,
  getChatModelId,
  getChatModelSource,
  getCurrentAgentFrame,
  getResolvedChatModel,
  popAgentFrame,
  pushAgentFrame,
  type AgentFrame,
  type ResolvedChatModelSnapshot,
} from "@/common/requestContext";

export type SubAgentRunProgress = {
  /** Aggregated payload for sub-agent output. */
  payload: SubAgentStreamPayload;
  /** Whether the sub-agent run is finished. */
  done: boolean;
};

/**
 * Creates a request-context frame for a sub-agent run (MVP).
 */
function createSubAgentFrame(input: { name: string; modelInfo: ResolvedChatModelSnapshot["modelInfo"] }): AgentFrame {
  const parent = getCurrentAgentFrame();
  return {
    kind: "sub",
    name: input.name,
    agentId: `sub-agent:${input.name}`,
    path: [...(parent?.path ?? []), input.name],
    model: { provider: input.modelInfo.provider, modelId: input.modelInfo.modelId },
  };
}

/**
 * Resolves the model for sub-agent runs.
 */
async function resolveSubAgentModel(): Promise<ResolvedChatModelSnapshot> {
  const cached = getResolvedChatModel();
  if (cached) return cached;
  const chatModelId = getChatModelId();
  const chatModelSource = getChatModelSource();
  // 中文注释：无缓存时使用当前请求的模型选择规则，保持与主 Agent 一致。
  return resolveChatModel({ chatModelId, chatModelSource });
}

/**
 * Builds a sub-agent stream payload snapshot for UI.
 */
function buildSubAgentPayload(input: {
  agentFrame: AgentFrame;
  status: SubAgentStreamPayload["status"];
  parts: SubAgentStreamPart[];
  errorText?: string;
}): SubAgentStreamPayload {
  return {
    type: "sub-agent-stream",
    agent: {
      name: input.agentFrame.name,
      id: input.agentFrame.agentId,
      model: input.agentFrame.model,
    },
    status: input.status,
    parts: input.parts,
    errorText: input.errorText,
  };
}

/**
 * Reads a sub-agent UI stream and yields structured progress (MVP).
 */
async function* readSubAgentStream(input: {
  stream: ReadableStream<any>;
  abortSignal?: AbortSignal;
  agentFrame: AgentFrame;
}) {
  const parts: SubAgentStreamPart[] = [];
  // 中文注释：按 toolCallId 合并 tool part，确保流式更新不产生重复节点。
  const toolPartIndexById = new Map<string, number>();
  let text = "";
  let reasoning = "";
  let lastEmitTextLength = 0;
  let lastEmitReasoningLength = 0;
  const minDeltaChars = 80;

  /** Ensure a text/reasoning part exists and return its index. */
  const ensureTextPart = (kind: "text" | "reasoning") => {
    const currentIndex = parts.findIndex((part) => part.type === kind);
    if (currentIndex >= 0) return currentIndex;
    parts.push({ type: kind, text: "" });
    return parts.length - 1;
  };

  /** Upsert a tool part by toolCallId to keep streaming state consistent. */
  const upsertToolPart = (toolCallId: string, patch: Partial<SubAgentStreamPart>) => {
    const existingIndex = toolPartIndexById.get(toolCallId);
    if (existingIndex !== undefined) {
      parts[existingIndex] = { ...parts[existingIndex], ...patch } as SubAgentStreamPart;
      return;
    }
    const nextPart: SubAgentStreamPart = {
      type: patch.type ?? "dynamic-tool",
      toolCallId,
      toolName: patch.toolName,
      title: patch.title,
      state: patch.state,
      input: patch.input,
      output: patch.output,
      errorText: patch.errorText,
    };
    parts.push(nextPart);
    toolPartIndexById.set(toolCallId, parts.length - 1);
  };

  /** Emit a snapshot payload for current aggregated parts. */
  const emitSnapshot = (status: SubAgentStreamPayload["status"], errorText?: string) => {
    const payload = buildSubAgentPayload({
      agentFrame: input.agentFrame,
      status,
      parts,
      errorText,
    });
    return { payload, done: status !== "streaming" } satisfies SubAgentRunProgress;
  };

  /** Normalize toolCallId to a stable string key. */
  const normalizeToolCallId = (value: unknown) => String(value ?? "");

  const reader = input.stream.getReader();
  try {
    // 中文注释：先发一帧空 payload，便于前端立即渲染子 Agent 容器。
    yield emitSnapshot("streaming");
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        yield emitSnapshot("done");
        return;
      }

      if (input.abortSignal?.aborted) {
        yield emitSnapshot("done");
        return;
      }

      if (!value || typeof value !== "object") continue;

      if (value.type === "error") {
        const errorText = String(value.errorText || "sub-agent stream error");
        yield emitSnapshot("error", errorText);
        return;
      }

      let shouldEmit = false;

      // 中文注释：把 SDK 的 stream 事件统一映射为可渲染的 parts。
      if (value.type === "text-delta" && typeof value.delta === "string") {
        text += value.delta;
        const index = ensureTextPart("text");
        parts[index] = { type: "text", text };
        shouldEmit = text.length - lastEmitTextLength >= minDeltaChars;
      }

      if (value.type === "reasoning-delta" && typeof value.delta === "string") {
        reasoning += value.delta;
        const index = ensureTextPart("reasoning");
        parts[index] = { type: "reasoning", text: reasoning };
        shouldEmit = shouldEmit || reasoning.length - lastEmitReasoningLength >= minDeltaChars;
      }

      if (value.type === "tool-input-start") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          type: value.dynamic ? "dynamic-tool" : `tool-${value.toolName}`,
          toolCallId,
          toolName: value.toolName,
          title: value.title,
          state: "input-streaming",
        });
        shouldEmit = true;
      }

      if (value.type === "tool-input-available") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          type: value.dynamic ? "dynamic-tool" : `tool-${value.toolName}`,
          toolCallId,
          toolName: value.toolName,
          title: value.title,
          state: "input-available",
          input: value.input,
        });
        shouldEmit = true;
      }

      if (value.type === "tool-approval-request") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          toolCallId,
          state: "approval-requested",
        });
        shouldEmit = true;
      }

      if (value.type === "tool-output-available") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          toolCallId,
          state: "output-available",
          output: value.output,
        });
        shouldEmit = true;
      }

      if (value.type === "tool-output-error") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          toolCallId,
          state: "output-error",
          errorText: value.errorText,
        });
        shouldEmit = true;
      }

      if (value.type === "tool-output-denied") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          toolCallId,
          state: "output-denied",
        });
        shouldEmit = true;
      }

      if (value.type === "tool-input-error") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          type: value.dynamic ? "dynamic-tool" : `tool-${value.toolName}`,
          toolCallId,
          toolName: value.toolName,
          title: value.title,
          state: "output-error",
          input: value.input,
          errorText: value.errorText,
        });
        shouldEmit = true;
      }

      if (value.type === "tool-call") {
        const toolCallId = normalizeToolCallId(value.toolCallId);
        upsertToolPart(toolCallId, {
          type: `tool-${value.toolName}`,
          toolCallId,
          toolName: value.toolName,
          state: "input-available",
          input: value.input,
        });
        shouldEmit = true;
      }

      if (value.type === "finish") {
        yield emitSnapshot("done");
        return;
      }

      if (shouldEmit) {
        lastEmitTextLength = text.length;
        lastEmitReasoningLength = reasoning.length;
        yield emitSnapshot("streaming");
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
 * Runs a sub-agent by name and streams structured output (MVP).
 */
export async function* runSubAgentStreaming(input: { name: string; task: string; abortSignal?: AbortSignal }) {
  const name = input.name.trim();
  const task = input.task.trim();
  if (!name) throw new Error("sub-agent name is required");
  if (!task) throw new Error("sub-agent task is required");

  // 优先复用主请求的 abortSignal（stop 会中止 MasterAgent + SubAgent）。
  const abortSignal = input.abortSignal ?? getAbortSignal();

  const resolved = await resolveSubAgentModel();

  const normalizedName = name.toLowerCase();
  const isBrowserSubAgent = normalizedName === "browser";
  const isTestSubAgent = normalizedName === "test" || normalizedName === "tester";
  // 中文注释：sub-agent 与主 agent 使用同一套模型解析结果，保证一致性。
  const agent = isBrowserSubAgent
    ? createBrowserSubAgent({ model: resolved.model, name: normalizedName })
    : isTestSubAgent
      ? createTestSubAgent({ model: resolved.model, name: normalizedName })
      : new ToolLoopAgent({
          model: resolved.model,
          instructions: buildSubAgentSystemPrompt({ name: normalizedName }),
          tools: buildToolset(toolPacks.subAgent),
        });

  const subAgentMessageId = generateId();
  const messages: UIMessage[] = [
    {
      id: subAgentMessageId,
      role: "user",
      parts: [{ type: "text", text: task }],
    } as any,
  ];

  const frame = createSubAgentFrame({ name: normalizedName, modelInfo: resolved.modelInfo });
  pushAgentFrame(frame);
  logger.debug({ subAgentName: name }, "[ai] sub-agent start");

  try {
    const stream = await createAgentUIStream({
      agent,
      uiMessages: messages as any[],
      abortSignal,
      generateMessageId: () => generateId(),
    });

    // 中文注释：把 SubAgent 的结构化 stream 聚合为渐进 payload，用于上层 tool output 流式展示。
    for await (const progress of readSubAgentStream({ stream: stream as any, abortSignal, agentFrame: frame })) {
      yield progress;
    }
    logger.debug({ subAgentName: name }, "[ai] sub-agent done");
  } finally {
    popAgentFrame();
  }
}
