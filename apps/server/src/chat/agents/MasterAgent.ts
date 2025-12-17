import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import { requestContextManager, type AgentFrame } from "@/context/requestContext";
import type { AgentMode } from "@teatime-ai/api/common";
import { browserReadonlyTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { subAgentTool } from "@/chat/tools/subAgent";
import { systemTools } from "@/chat/tools/system";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { timeNowToolDef } from "@teatime-ai/api/types/tools/system";

const MASTER_AGENT_NAME = "master";
const MASTER_MAX_DEPTH = 4;

function createMasterTools(mode: AgentMode) {
  // 关键：通过“只暴露允许的 tools”做权限边界（MVP）
  if (mode === "settings") {
    return {
      ...systemTools,
      ...browserReadonlyTools,
      [subAgentToolDef.id]: subAgentTool,
    };
  }

  return {
    [timeNowToolDef.id]: systemTools[timeNowToolDef.id],
    // ...browserTools,
    ...dbTools,
    [subAgentToolDef.id]: subAgentTool,
  };
}

function buildMasterInstructions(mode: AgentMode) {
  const workspaceId = requestContextManager.getWorkspaceId();
  const activeTab = requestContextManager.getContext()?.activeTab;

  return `
你是 Teatime 的AI助手。
- 你的职责：理解用户意图、选择合适的工具/子 agent 来完成任务。
- 返回必须是 Markdown。
- 除非用户明确要求，否则不要把工具返回的原始数据直接贴给用户。

权限范围：
- mode=${mode}
- project 模式：允许查询项目数据，并可通过 open-url 在当前 Tab 打开网页。
- settings 模式：不允许操作项目数据，也不允许触发网页打开（仅做设置相关的答疑/指导）。

当前 workspaceId：${workspaceId ?? "unknown"}
当前 tabId：${activeTab?.id ?? "unknown"}
当前页面：${activeTab?.base?.component ?? "unknown"}
`;
}

// 关键：MasterAgent 用面向对象封装“配置 + tools + instructions”
export class MasterAgent {
  constructor(readonly mode: AgentMode) {}

  createAgent() {
    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: buildMasterInstructions(this.mode),
      tools: createMasterTools(this.mode),
    });
  }

  // 关键：用于 subAgent 递归检测与前端标识
  createFrame(): AgentFrame {
    return {
      kind: "master",
      name: MASTER_AGENT_NAME,
      // 关键：master 默认允许调用任意 subAgent（找不到会由 subAgentTool 返回 NOT_FOUND）
      allowedSubAgents: [],
      maxDepth: MASTER_MAX_DEPTH,
      path: [MASTER_AGENT_NAME],
    };
  }
}
