import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentFrame } from "@/ai/shared/context/requestContext";
import {
  createMasterAgent,
  createMasterAgentFrame,
  type MasterAgentModelInfo,
} from "@/ai/agents/masterAgent/masterAgent";

type MasterAgentRunnerInput = {
  /** Model instance for the agent. */
  model: LanguageModelV3;
  /** Model metadata for the agent frame. */
  modelInfo: MasterAgentModelInfo;
  /** Optional tool ids override. */
  toolIds?: readonly string[];
};

export type MasterAgentRunner = {
  /** ToolLoopAgent instance. */
  agent: ReturnType<typeof createMasterAgent>;
  /** Frame metadata for the agent. */
  frame: AgentFrame;
};

/**
 * Creates a master agent runner for the current request (MVP).
 */
export function createMasterAgentRunner(input: MasterAgentRunnerInput): MasterAgentRunner {
  // runner 负责“把 agent 组装起来”，SSE/持久化/中断由 chatStream 服务管理。
  return {
    agent: createMasterAgent({ model: input.model, toolIds: input.toolIds }),
    frame: createMasterAgentFrame({ model: input.modelInfo }),
  };
}
