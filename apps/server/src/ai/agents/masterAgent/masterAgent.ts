import { ToolLoopAgent } from "ai";
import type { AgentFrame } from "@/common/requestContext";
import { buildMasterAgentSystemPrompt } from "@/ai/prompts/systemPromptBuilder";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { toolPacks } from "@/ai/registry/toolPacks";
import { xai } from "@ai-sdk/xai";

const MASTER_AGENT_NAME = "MasterAgent";
const MASTER_AGENT_ID = "master-agent";
const MASTER_AGENT_MODEL = { provider: "xai", modelId: "grok-4-1-fast-reasoning" } as const;

/**
 * Creates the master agent instance (MVP).
 */
export function createMasterAgent() {
  return new ToolLoopAgent({
    model: xai(MASTER_AGENT_MODEL.modelId),
    instructions: buildMasterAgentSystemPrompt(),
    tools: buildToolset(toolPacks.masterAgent),
  });
}

/**
 * Creates the frame metadata for the master agent (MVP).
 */
export function createMasterAgentFrame(): AgentFrame {
  // kind 目前沿用 master/sub；命名统一到 MasterAgent/SubAgent，便于理解与排障。
  return {
    kind: "master",
    name: MASTER_AGENT_NAME,
    agentId: MASTER_AGENT_ID,
    path: [MASTER_AGENT_NAME],
    model: MASTER_AGENT_MODEL,
  };
}
