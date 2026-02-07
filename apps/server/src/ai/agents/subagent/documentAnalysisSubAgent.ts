import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  listDirToolDef,
  readFileToolDef,
  shellCommandToolDefUnix,
  shellCommandToolDefWin,
  shellToolDefUnix,
  shellToolDefWin,
} from "@tenas-ai/api/types/tools/runtime";
import { documentAnalysisSubAgentName } from "@tenas-ai/api/types/tools/subAgent";
import { buildToolset } from "@/ai/tools/toolRegistry";
import { createToolCallRepair } from "@/ai/agents/repairToolCall";
import DOCUMENT_ANALYSIS_SUB_AGENT_PROMPT_RAW from "./documentAnalysisSubAgent.zh.md";

/** Document analysis sub-agent display name. */
export const DOCUMENT_ANALYSIS_SUB_AGENT_NAME = documentAnalysisSubAgentName;
/** Document analysis sub-agent id. */
const DOCUMENT_ANALYSIS_SUB_AGENT_ID = "document-analysis-sub-agent";
/** Document analysis sub-agent tool ids. */
const DOCUMENT_ANALYSIS_SUB_AGENT_TOOL_IDS = [
  readFileToolDef.id,
  listDirToolDef.id,
  shellToolDefUnix.id,
  shellToolDefWin.id,
  shellCommandToolDefUnix.id,
  shellCommandToolDefWin.id,
] as const;
/** Default document analysis sub-agent system prompt. */
const DEFAULT_DOCUMENT_ANALYSIS_SUB_AGENT_SYSTEM_PROMPT = DOCUMENT_ANALYSIS_SUB_AGENT_PROMPT_RAW.trim();

type CreateDocumentAnalysisSubAgentInput = {
  /** Model instance for the sub-agent. */
  model: LanguageModelV3;
  /** Optional tool ids override. */
  toolIds?: readonly string[];
};

/**
 * Builds the system prompt for the document analysis sub-agent.
 */
function buildDocumentAnalysisSubAgentSystemPrompt(): string {
  // 逻辑：统一封装 system prompt，便于后续扩展。
  return DEFAULT_DOCUMENT_ANALYSIS_SUB_AGENT_SYSTEM_PROMPT;
}

/**
 * Creates the document analysis sub-agent instance.
 */
export function createDocumentAnalysisSubAgent(
  input: CreateDocumentAnalysisSubAgentInput,
) {
  // 逻辑：只暴露文档读取与分析相关工具，避免误用写入能力。
  // 逻辑：未传 toolIds 时沿用默认工具集。
  const toolIds = input.toolIds ?? DOCUMENT_ANALYSIS_SUB_AGENT_TOOL_IDS;
  return new ToolLoopAgent({
    id: DOCUMENT_ANALYSIS_SUB_AGENT_ID,
    model: input.model,
    instructions: buildDocumentAnalysisSubAgentSystemPrompt(),
    tools: buildToolset(toolIds),
    experimental_repairToolCall: createToolCallRepair(),
  });
}
