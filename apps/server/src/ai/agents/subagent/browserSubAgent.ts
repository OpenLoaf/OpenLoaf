import { readFileSync } from "node:fs";
import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@tenas-ai/api/types/tools/browserAutomation";
import { browserSubAgentName } from "@tenas-ai/api/types/tools/subAgent";
import { buildToolset } from "@/ai/registry/toolRegistry";

/** Browser sub-agent display name. */
export const BROWSER_SUB_AGENT_NAME = browserSubAgentName;
/** Browser sub-agent id. */
const BROWSER_SUB_AGENT_ID = "browser-sub-agent";
/** Browser sub-agent tool ids. */
const BROWSER_SUB_AGENT_TOOL_IDS = [
  openUrlToolDef.id,
  browserSnapshotToolDef.id,
  browserObserveToolDef.id,
  browserExtractToolDef.id,
  browserActToolDef.id,
  browserWaitToolDef.id,
] as const;
/** Default browser sub-agent system prompt. */
const BROWSER_SUB_AGENT_PROMPT_URL = new URL(
  "./browserSubAgent.zh.md",
  import.meta.url,
);
const DEFAULT_BROWSER_SUB_AGENT_SYSTEM_PROMPT = readFileSync(
  BROWSER_SUB_AGENT_PROMPT_URL,
  "utf8",
).trim();

export type CreateBrowserSubAgentInput = {
  /** Model instance for the sub-agent. */
  model: LanguageModelV3;
  /** Optional tool ids override. */
  toolIds?: readonly string[];
};

/**
 * Builds the system prompt for the browser sub-agent.
 */
function buildBrowserSubAgentSystemPrompt(): string {
  // 逻辑：统一封装 system prompt，便于后续扩展。
  return DEFAULT_BROWSER_SUB_AGENT_SYSTEM_PROMPT;
}

/**
 * Creates the browser sub-agent instance.
 */
export function createBrowserSubAgent(input: CreateBrowserSubAgentInput) {
  // 逻辑：仅暴露网页操作相关工具，避免误用其他能力。
  // 逻辑：未传 toolIds 时沿用默认工具集。
  const toolIds = input.toolIds ?? BROWSER_SUB_AGENT_TOOL_IDS;
  return new ToolLoopAgent({
    id: BROWSER_SUB_AGENT_ID,
    model: input.model,
    instructions: buildBrowserSubAgentSystemPrompt(),
    tools: buildToolset(toolIds),
  });
}
