import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentFrame } from "@/common/requestContext";
import { buildMasterAgentSystemPrompt } from "@/ai/prompts/systemPromptBuilder";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { toolPacks } from "@/ai/registry/toolPacks";

const MASTER_AGENT_NAME = "MasterAgent";
const MASTER_AGENT_ID = "master-agent";

export type MasterAgentModelInfo = {
  provider: string;
  modelId: string;
};

/**
 * Creates the master agent instance (MVP).
 */
export function createMasterAgent(input: { model: LanguageModelV3 }) {
  return new ToolLoopAgent({
    model: input.model,
    instructions: buildMasterAgentSystemPrompt(),
    tools: buildToolset(toolPacks.masterAgent),
  });
}

/**
 * Creates the frame metadata for the master agent (MVP).
 */
export function createMasterAgentFrame(input: { model: MasterAgentModelInfo }): AgentFrame {
  // 中文注释：当前仅保留 MasterAgent，便于定位消息来源。
  return {
    kind: "master",
    name: MASTER_AGENT_NAME,
    agentId: MASTER_AGENT_ID,
    path: [MASTER_AGENT_NAME],
    model: input.model,
  };
}
