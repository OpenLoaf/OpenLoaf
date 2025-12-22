import type { AgentFrame } from "@/common/requestContext";
import { createMasterAgent, createMasterAgentFrame } from "@/ai/agents/masterAgent/masterAgent";

export type MasterAgentRunner = {
  agent: ReturnType<typeof createMasterAgent>;
  frame: AgentFrame;
};

/**
 * Creates a master agent runner for the current request (MVP).
 */
export function createMasterAgentRunner(): MasterAgentRunner {
  // runner 负责“把 agent 组装起来”，SSE/持久化/中断仍由 ChatSseRoutes 统一管理。
  return {
    agent: createMasterAgent(),
    frame: createMasterAgentFrame(),
  };
}
