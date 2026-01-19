import { readFileSync } from "node:fs";
import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentFrame } from "@/ai/chat-stream/requestContext";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { testApprovalToolDef } from "@tenas-ai/api/types/tools/approvalTest";
import { timeNowToolDef } from "@tenas-ai/api/types/tools/system";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";
import {
  grepFilesToolDef,
  listDirToolDef,
  readFileToolDef,
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
  testApprovalToolDef.id,
  subAgentToolDef.id,
  shellToolDef.id,
  shellCommandToolDef.id,
  execCommandToolDef.id,
  writeStdinToolDef.id,
  readFileToolDef.id,
  listDirToolDef.id,
  grepFilesToolDef.id,
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
 * Builds the system prompt for the master agent (MVP).
 */
function buildMasterAgentSystemPrompt(): string {
  const basePrompt = readMasterAgentBasePrompt();
  return basePrompt;
}

/**
 * Creates the master agent instance (MVP).
 */
export function createMasterAgent(input: { model: LanguageModelV3 }) {
  return new ToolLoopAgent({
    model: input.model,
    instructions: buildMasterAgentSystemPrompt(),
    tools: buildToolset(MASTER_AGENT_TOOL_IDS),
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
