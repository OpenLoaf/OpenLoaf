import { ToolLoopAgent } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentFrame } from "@/ai/chat-stream/requestContext";
import { getWorkspaceId } from "@/ai/chat-stream/requestContext";
import { buildToolset } from "@/ai/registry/toolRegistry";
import { testApprovalToolDef } from "@tenas-ai/api/types/tools/approvalTest";
import {
  fileDeleteToolDef,
  fileListToolDef,
  fileReadToolDef,
  fileSearchToolDef,
  fileWriteToolDef,
  shellDestructiveToolDef,
  shellReadonlyToolDef,
  shellWriteToolDef,
  timeNowToolDef,
  webFetchToolDef,
  webSearchToolDef,
} from "@tenas-ai/api/types/tools/system";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";

/** Master agent display name. */
const MASTER_AGENT_NAME = "MasterAgent";
/** Master agent id. */
const MASTER_AGENT_ID = "master-agent";
/** Master agent tool ids. */
const MASTER_AGENT_TOOL_IDS = [
  timeNowToolDef.id,
  fileReadToolDef.id,
  fileListToolDef.id,
  fileSearchToolDef.id,
  fileWriteToolDef.id,
  fileDeleteToolDef.id,
  shellReadonlyToolDef.id,
  shellWriteToolDef.id,
  shellDestructiveToolDef.id,
  webFetchToolDef.id,
  webSearchToolDef.id,
  testApprovalToolDef.id,
  subAgentToolDef.id,
] as const;

export type MasterAgentModelInfo = {
  /** Model provider name. */
  provider: string;
  /** Model id. */
  modelId: string;
};

/**
 * Builds the system prompt for the master agent (MVP).
 */
function buildMasterAgentSystemPrompt(): string {
  const workspaceId = getWorkspaceId() ?? "unknown";

  // 按“目标/环境/工具/规则/完成条件”分段，方便后续扩展与测试。
  const sections = [
    [
      "你是 Tenas 的 AI 助手（MasterAgent）。",
      "- 输出必须是 Markdown。",
      "- 优先使用工具完成用户指令，必要时再做解释。",
    ].join("\n"),
    ["环境：", `- workspaceId: ${workspaceId}`].join("\n"),
    [
      "规则：",
      "- 不要捏造事实；不知道就说明并建议用工具获取信息。",
      "- 工具返回的数据需要简要总结后再继续下一步。",
      "- 任务较复杂时可以调用 sub-agent 工具拆分处理。",
    ].join("\n"),
    ["完成条件：", "- 用户问题被解决，或给出明确下一步操作。"].join("\n"),
  ];

  return sections.join("\n\n");
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
  // 中文注释：当前仅保留 MasterAgent，便于定位消息来源。
  return {
    kind: "master",
    name: MASTER_AGENT_NAME,
    agentId: MASTER_AGENT_ID,
    path: [MASTER_AGENT_NAME],
    model: input.model,
  };
}
