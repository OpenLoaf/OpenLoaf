import type { LanguageModelV3 } from "@ai-sdk/provider";
import { ToolLoopAgent } from "ai";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { toolPacks } from "@/ai/registry/toolPacks";
import { buildBrowserSubAgentSystemPrompt } from "@/ai/prompts/browserSubAgentPromptBuilder";

/**
 * Creates a browser-focused sub-agent instance.
 */
export function createBrowserSubAgent(input: { model: LanguageModelV3; name: string }) {
  return new ToolLoopAgent({
    model: input.model,
    instructions: buildBrowserSubAgentSystemPrompt({ name: input.name }),
    tools: buildToolset(toolPacks.browserSubAgent),
  });
}
