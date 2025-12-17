import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import type { AgentMode } from "@teatime-ai/api/common";
import { browserReadonlyTools, browserTools } from "@/chat/tools/browser";
import { systemTools } from "@/chat/tools/system";
import { subAgentTool } from "@/chat/tools/subAgent";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { SubAgent } from "./SubAgent";

export class BrowserSubAgent extends SubAgent {
  readonly name = "browser";

  createSystemPrompt(mode: AgentMode) {
    return `
你是 Teatime 的浏览器子 Agent。
- 你的职责：帮助主 Agent 完成“查资料/打开网页/解释网页内容”等任务。
- 输出必须是 Markdown，优先总结结论，再给出必要的步骤与来源。
- 不要把网页原始 HTML 直接贴出来。
- mode=${mode}
`;
  }

  createAgent(mode: AgentMode) {
    // 关键：BrowserSubAgent 的 tools 需要显式定义（避免被抽象层包装/遗漏）
    const tools =
      mode === "settings"
        ? {
            ...systemTools,
            ...browserReadonlyTools,
            [subAgentToolDef.id]: subAgentTool,
          }
        : {
            ...systemTools,
            ...browserTools,
            [subAgentToolDef.id]: subAgentTool,
          };

    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: this.createSystemPrompt(mode),
      tools,
    });
  }
}
