import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import { getWorkspaceId, type AgentFrame } from "@/common/requestContext";
import { systemTools } from "@/ai/tools/system";
import { dbTools } from "@/ai/tools/db";
import { subAgentTool } from "@/ai/tools/subAgent";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";

const MASTER_AGENT_NAME = "master";
const MASTER_AGENT_ID = "master";
const MASTER_AGENT_MODEL = { provider: "deepseek", modelId: "deepseek-chat" } as const;

function createMasterTools() {
  return {
    ...systemTools,
    ...dbTools,
    [subAgentToolDef.id]: subAgentTool,
  };
}

function buildMasterInstructions() {
  const workspaceId = getWorkspaceId();

  return `
你是 Teatime 的AI助手。
- 返回必须是 Markdown。
- 核心要求：优先使用工具完成用户指令。

当前 workspaceId：${workspaceId ?? "unknown"}
`;
}

/**
 * MasterAgent（MVP）：
 * - 封装 model + tools + instructions
 * - 由 /chat/sse 入口创建并运行
 */
export class MasterAgent {
  createAgent() {
    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: buildMasterInstructions(),
      tools: createMasterTools(),
    });
  }

  /** 创建 agent frame（用于 UI/日志标识来源）。 */
  createFrame(): AgentFrame {
    return {
      kind: "master",
      name: MASTER_AGENT_NAME,
      agentId: MASTER_AGENT_ID,
      path: [MASTER_AGENT_NAME],
      model: MASTER_AGENT_MODEL,
    };
  }
}
