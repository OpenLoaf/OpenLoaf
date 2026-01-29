import { readFileSync } from "node:fs";
import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentFrame } from "@/ai/shared/context/requestContext";
import { buildToolset } from "@/ai/tools/toolRegistry";
import { createToolCallRepair } from "@/ai/agents/repairToolCall";
import { jsonRenderToolDef } from "@tenas-ai/api/types/tools/jsonRender";
import { timeNowToolDef } from "@tenas-ai/api/types/tools/system";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@tenas-ai/api/types/tools/browserAutomation";
import {
  listDirToolDef,
  readFileToolDef,
  writeFileToolDef,
  shellCommandToolDefUnix,
  shellCommandToolDefWin,
  shellToolDefUnix,
  shellToolDefWin,
  execCommandToolDefUnix,
  execCommandToolDefWin,
  writeStdinToolDefUnix,
  writeStdinToolDefWin,
  updatePlanToolDef,
} from "@tenas-ai/api/types/tools/runtime";

/** Master agent display name. */
const MASTER_AGENT_NAME = "MasterAgent";
/** Master agent id. */
const MASTER_AGENT_ID = "master-agent";
const isWindows = process.platform === "win32";
const shellToolDef = isWindows ? shellToolDefWin : shellToolDefUnix;
const shellCommandToolDef = isWindows ? shellCommandToolDefWin : shellCommandToolDefUnix;
const execCommandToolDef = isWindows ? execCommandToolDefWin : execCommandToolDefUnix;
const writeStdinToolDef = isWindows ? writeStdinToolDefWin : writeStdinToolDefUnix;
/** Master agent tool ids. */
const MASTER_AGENT_TOOL_IDS = [
  timeNowToolDef.id,
  jsonRenderToolDef.id,
  subAgentToolDef.id,
  openUrlToolDef.id,
  browserSnapshotToolDef.id,
  browserObserveToolDef.id,
  browserExtractToolDef.id,
  browserActToolDef.id,
  browserWaitToolDef.id,
  shellToolDef.id,
  shellCommandToolDef.id,
  execCommandToolDef.id,
  writeStdinToolDef.id,
  readFileToolDef.id,
  writeFileToolDef.id,
  listDirToolDef.id,
  updatePlanToolDef.id,
] as const;

/** Master agent base prompt url. */
const MASTER_AGENT_PROMPT_URL = new URL("./masterAgentPrompt.zh.md", import.meta.url);

export type MasterAgentModelInfo = {
  /** Model provider name. */
  provider: string;
  /** Model id. */
  modelId: string;
};

type CreateMasterAgentInput = {
  /** Model instance for the agent. */
  model: LanguageModelV3;
  /** Optional tool ids override. */
  toolIds?: readonly string[];
};

/** Read base system prompt markdown content. */
function readMasterAgentBasePrompt(): string {
  try {
    // 逻辑：基础提示词固定在 masterAgent 目录下的 md 文件。
    return readFileSync(MASTER_AGENT_PROMPT_URL, "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * Creates the master agent instance (MVP).
 */
export function createMasterAgent(input: CreateMasterAgentInput) {
  // 逻辑：未传 toolIds 时沿用默认工具集。
  const toolIds = input.toolIds ?? MASTER_AGENT_TOOL_IDS;
  return new ToolLoopAgent({
    model: input.model,
    instructions: readMasterAgentBasePrompt(),
    // 中文注释：审批逻辑由工具实现的 needsApproval 控制，agent 只负责装配工具集。
    tools: buildToolset(toolIds),
    experimental_repairToolCall: createToolCallRepair(),
  });
}

/**
 * Creates the frame metadata for the master agent (MVP).
 */
export function createMasterAgentFrame(input: { model: MasterAgentModelInfo }): AgentFrame {
  // 当前仅保留 MasterAgent，便于定位消息来源。
  return {
    kind: "master",
    name: MASTER_AGENT_NAME,
    agentId: MASTER_AGENT_ID,
    path: [MASTER_AGENT_NAME],
    model: input.model,
  };
}
