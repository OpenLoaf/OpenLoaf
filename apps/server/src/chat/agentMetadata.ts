import type { AgentFrame } from "@/context/requestContext";
import { requestContextManager } from "@/context/requestContext";

export type AgentMetadata = {
  agent: {
    // 关键：对齐 AI SDK Agent 的标识（仅用于展示/追溯，运行时不依赖）
    version: "agent-v1";
    kind: AgentFrame["kind"];
    name: string;
    id: string;
    model?: AgentFrame["model"];
  };
};

/**
 * 从当前请求上下文的 agent 栈里生成 metadata.agent。
 * - 仅用于 UI 展示与历史追溯，不参与业务逻辑判断
 */
export function agentMetadataFromStack(): AgentMetadata | undefined {
  const frame = requestContextManager.getCurrentAgentFrame();
  if (!frame) return undefined;
  return {
    agent: {
      version: "agent-v1",
      kind: frame.kind,
      name: frame.name,
      id: frame.agentId,
      model: frame.model,
    },
  };
}

/**
 * AI SDK 的 messageMetadata 回调：根据 part 类型生成 metadata。
 * - start：只写 agent 信息
 * - finish：额外写 totalUsage
 */
export function messageMetadataFromStackPart(part: { type?: string; totalUsage?: unknown }) {
  const base = agentMetadataFromStack();
  if (!part || typeof part !== "object") return base;
  if (part.type === "finish") {
    return { ...(base ?? {}), totalUsage: (part as any).totalUsage };
  }
  if (part.type === "start") return base ?? {};
  return base;
}

