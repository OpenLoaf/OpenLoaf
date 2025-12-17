import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import { browserTools, dbTools, systemTools, uiTools } from "./tools";
import { requestContextManager } from "@/context/requestContext";

type AgentMode = "project" | "settings";

function createToolsByMode(mode: AgentMode) {
  // 关键：通过“只暴露允许的 tools”来做权限边界（MVP）
  if (mode === "settings") {
    return {
      ...systemTools,
      ...browserTools,
    };
  }

  return {
    ...systemTools,
    ...browserTools,
    ...dbTools,
    ...uiTools,
  };
}

export const createMainAgent = (mode: AgentMode) => {
  const requestTools = createToolsByMode(mode);
  const workspaceId = requestContextManager.getWorkspaceId();
  const activeTab = requestContextManager.getContext()?.activeTab;

  return new ToolLoopAgent({
    model: deepseek("deepseek-chat"),
    instructions: `
    你是 Teatime 的主 Agent。
    - 你的职责：理解用户意图、选择合适的工具/子能力来完成任务。
    - 返回必须是 Markdown。
    - 除非用户明确要求，否则不要把工具返回的原始数据直接贴给用户。

    权限范围：
    - mode=${mode}
    - project 模式：允许查询项目数据，并可通过 open_url 在当前 Tab 打开网页。
    - settings 模式：不允许操作项目数据，也不允许触发网页打开（仅做设置相关的答疑/指导）。

    当前 workspaceId：${workspaceId ?? "unknown"}
    当前 tabId：${activeTab?.id ?? "unknown"}
    当前页面：${activeTab?.base?.component ?? "unknown"}
    `,
    tools: requestTools,
  });
};
