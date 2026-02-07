import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { testApprovalToolDef } from "@tenas-ai/api/types/tools/approvalTest";
import { timeNowToolDef } from "@tenas-ai/api/types/tools/system";
import { testApprovalSubAgentName } from "@tenas-ai/api/types/tools/subAgent";
import { buildToolset } from "@/ai/tools/toolRegistry";
import { createToolCallRepair } from "@/ai/agents/repairToolCall";
import TEST_APPROVAL_SUB_AGENT_PROMPT_RAW from "./testApprovalSubAgent.zh.md";

/** Test approval sub-agent display name. */
export const TEST_APPROVAL_SUB_AGENT_NAME = testApprovalSubAgentName;
/** Test approval sub-agent id. */
const TEST_APPROVAL_SUB_AGENT_ID = "test-approval-sub-agent";
/** Test approval sub-agent tool ids. */
const TEST_APPROVAL_SUB_AGENT_TOOL_IDS = [
  testApprovalToolDef.id,
  timeNowToolDef.id,
] as const;
/** Default test approval sub-agent system prompt. */
const DEFAULT_TEST_APPROVAL_SUB_AGENT_SYSTEM_PROMPT = TEST_APPROVAL_SUB_AGENT_PROMPT_RAW.trim();

type CreateTestApprovalSubAgentInput = {
  /** Model instance for the sub-agent. */
  model: LanguageModelV3;
  /** Optional tool ids override. */
  toolIds?: readonly string[];
};

/**
 * Builds the system prompt for the test approval sub-agent.
 */
function buildTestApprovalSubAgentSystemPrompt(): string {
  // 逻辑：统一封装 system prompt，便于后续扩展。
  return DEFAULT_TEST_APPROVAL_SUB_AGENT_SYSTEM_PROMPT;
}

/**
 * Creates the test approval sub-agent instance.
 */
export function createTestApprovalSubAgent(input: CreateTestApprovalSubAgentInput) {
  // 逻辑：仅暴露审批与时间相关工具，避免误用其他能力。
  // 逻辑：未传 toolIds 时沿用默认工具集。
  const toolIds = input.toolIds ?? TEST_APPROVAL_SUB_AGENT_TOOL_IDS;
  return new ToolLoopAgent({
    id: TEST_APPROVAL_SUB_AGENT_ID,
    model: input.model,
    instructions: buildTestApprovalSubAgentSystemPrompt(),
    tools: buildToolset(toolIds),
    experimental_repairToolCall: createToolCallRepair(),
  });
}
