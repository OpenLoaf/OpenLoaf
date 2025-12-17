import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import type { AgentMode } from "@teatime-ai/api/common";
import { browserReadonlyTools, browserTools } from "@/chat/tools/browser";
import { systemTools } from "@/chat/tools/system";
import { subAgentTool } from "@/chat/tools/subAgent";
import { SubAgent } from "./SubAgent";

export class BrowserSubAgent extends SubAgent {
  readonly name = "browser";

  createTools(mode: AgentMode) {
    // 关键：subAgent 也允许再委派 subAgent（多重 subAgent 的基础）
    const base = mode === "settings" ? browserReadonlyTools : browserTools;
    return {
      ...systemTools,
      ...base,
      subAgent: subAgentTool,
    };
  }

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
    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: this.createSystemPrompt(mode),
      tools: this.createTools(mode),
    });
  }
}
