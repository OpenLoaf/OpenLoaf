import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentFrame } from "@/ai/chat-stream/requestContext";
import {
  createMasterAgent,
  createMasterAgentFrame,
  type MasterAgentModelInfo,
} from "@/ai/agents/masterAgent/masterAgent";

export type MasterAgentRunnerInput = {
  model: LanguageModelV3;
  modelInfo: MasterAgentModelInfo;
};

export type MasterAgentRunner = {
  agent: ReturnType<typeof createMasterAgent>;
  frame: AgentFrame;
};

/**
 * Creates a master agent runner for the current request (MVP).
 */
export function createMasterAgentRunner(input: MasterAgentRunnerInput): MasterAgentRunner {
  // runner 负责“把 agent 组装起来”，SSE/持久化/中断由 chat-stream 管理。
  return {
    agent: createMasterAgent({ model: input.model }),
    frame: createMasterAgentFrame({ model: input.modelInfo }),
  };
}
