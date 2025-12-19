import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import { requestContextManager, type AgentFrame } from "@/context/requestContext";
import { openUrlTool } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { subAgentTool } from "@/chat/tools/subAgent";
import { systemTools } from "@/chat/tools/system";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";

const MASTER_AGENT_NAME = "master";
const MASTER_AGENT_ID = "master";

function createMasterTools() {
  return {
    ...systemTools,
    ...dbTools,
    [openUrlToolDef.id]: openUrlTool,
    [subAgentToolDef.id]: subAgentTool,
  };
}

function buildMasterInstructions() {
  const workspaceId = requestContextManager.getWorkspaceId();

  return `
你是 Teatime 的AI助手。
- 你的职责：理解用户意图、选择合适的工具/子 agent 来完成任务。
- 返回必须是 Markdown。
- 除非用户明确要求，否则不要把工具返回的原始数据直接贴给用户。
- 核心要求：必须最大程度使用现有的工具与子 agent 来完成用户指令；除非权限/环境限制或缺少关键信息，否则不要只给“建议/口头步骤”而不行动。
- 不确定时的处理：
  - 优先通过工具自查/验证（例如先查状态、再执行、再校验），避免凭空猜测。
  - 只有在执行会产生明显歧义/风险时才向用户提问澄清；否则先按最合理默认值推进并说明假设。
- 子 agent 使用原则：遇到网页理解/自动化优先交给 browser sub-agent；需要项目数据/数据库操作优先使用 db tools；复杂任务优先拆解并逐步验证结果。

当前 workspaceId：${workspaceId ?? "unknown"}
`;
}

// 关键：MasterAgent 用面向对象封装“配置 + tools + instructions”
export class MasterAgent {
  createAgent() {
    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: buildMasterInstructions(),
      tools: createMasterTools(),
    });
  }

  // 关键：用于前端标识该条消息由 master 生成
  createFrame(): AgentFrame {
    return {
      kind: "master",
      name: MASTER_AGENT_NAME,
      agentId: MASTER_AGENT_ID,
      path: [MASTER_AGENT_NAME],
    };
  }
}
