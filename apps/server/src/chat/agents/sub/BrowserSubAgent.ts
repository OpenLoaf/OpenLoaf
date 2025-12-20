import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent } from "ai";
import { browserTools } from "@/chat/tools/browser";
import { systemTools } from "@/chat/tools/system";
import { SubAgent } from "./SubAgent";

export class BrowserSubAgent extends SubAgent {
  readonly name = "browser";
  readonly agentId = "browser";

  createSystemPrompt() {
    return `
你是 Teatime 的浏览器子 Agent。
- 输出必须是 Markdown。
- 先 open-url 拿到 pageTargetId/cdpTargetId，再用 playwright 工具执行与验证。
`;
  }

  createAgent() {
    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: this.createSystemPrompt(),
      tools: { ...browserTools, ...systemTools },
    });
  }
}
