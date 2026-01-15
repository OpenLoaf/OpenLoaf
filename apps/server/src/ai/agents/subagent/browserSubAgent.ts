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
const DEFAULT_BROWSER_SUB_AGENT_SYSTEM_PROMPT = [
  "你是 BrowserSubAgent，负责处理与网页操作相关的任务。",
  "优先使用浏览器相关工具获取真实页面信息，再给出结论。",
  "只输出任务相关的结果与必要步骤，不要复述任务。",
].join("\n");

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
export function createBrowserSubAgent(input: { model: LanguageModelV3 }) {
  // 逻辑：仅暴露网页操作相关工具，避免误用其他能力。
  return new ToolLoopAgent({
    id: BROWSER_SUB_AGENT_ID,
    model: input.model,
    instructions: buildBrowserSubAgentSystemPrompt(),
    tools: buildToolset(BROWSER_SUB_AGENT_TOOL_IDS),
  });
}
