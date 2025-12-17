import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import { requestContextManager } from "@/context/requestContext";
import type { AgentMode } from "./mode";
import { createToolsByMode } from "./tools";

export function createMainAgent(mode: AgentMode) {
  const tools = createToolsByMode(mode);
  const workspaceId = requestContextManager.getWorkspaceId();
  const activeTab = requestContextManager.getContext()?.activeTab;

  return new ToolLoopAgent({
    model: deepseek("deepseek-chat"),
    instructions: `
你是 Teatime 的主 Agent（MVP）。
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
    tools,
  });
}

