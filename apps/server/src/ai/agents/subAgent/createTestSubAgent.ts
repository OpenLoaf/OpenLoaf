import type { LanguageModelV3 } from "@ai-sdk/provider";
import { ToolLoopAgent } from "ai";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { toolPacks } from "@/ai/registry/toolPacks";
import { buildTestSubAgentSystemPrompt } from "@/ai/prompts/testSubAgentPromptBuilder";

/**
 * Creates a test sub-agent instance for verifying tool flow.
 */
export function createTestSubAgent(input: { model: LanguageModelV3; name: string }) {
  return new ToolLoopAgent({
    model: input.model,
    instructions: buildTestSubAgentSystemPrompt({ name: input.name }),
    tools: buildToolset(toolPacks.testSubAgent),
  });
}
