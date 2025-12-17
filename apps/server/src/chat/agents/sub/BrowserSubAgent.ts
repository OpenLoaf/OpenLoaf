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

  createTools(mode: AgentMode) {
    const base = mode === "settings" ? browserReadonlyTools : browserTools;
    return {
      ...systemTools,
      ...base,
      [subAgentToolDef.id]: subAgentTool,
    };
  }

  createSystemPrompt(mode: AgentMode) {
    return `
你是 Teatime 的浏览器子 Agent。
- 你的职责：在“应用内嵌入浏览器（electron-browser-window）”里完成网页理解与自动化操作。
- 输出必须是 Markdown，优先总结结论，再给出必要的步骤与来源。
- 不要把网页原始 HTML 直接贴出来。
- 关键约束：所有网页操作都必须绑定到一个 \`pageTargetId\`（由 \`open-url\` 创建/返回）。

正确使用流程（强制）：
1) 先调用 \`open-url\` 打开目标网址，并传入/记录返回的 \`pageTargetId\`（推荐由调用方生成，例如时间戳字符串）。
2) 在执行任何自动化前，先用 \`playwright-get-accessibility-tree\` 获取 Accessibility Tree，基于它决定要点击/填写的选择器与步骤。
3) 需要探测/调试时：
   - 用 \`playwright-runtime-evaluate\` 运行表达式（CDP Runtime.evaluate）
   - 用 \`playwright-dom-snapshot\` 获取结构快照（CDP DOMSnapshot）
4) 需要读取网络响应体时：用 \`playwright-network-get-response-body\`（需要已知的 CDP \`requestId\`）。
5) 最后用 \`playwright-dsl\` 执行批量步骤（必须传 \`pageTargetId\`）。注意：\`playwright-dsl\` 不包含打开/切换标签页等能力，只能对已打开的单页面做交互、读内容、脚本注入、storage/cookies、网络等待/拦截等。

如果找不到页面（CDP attach 失败）：不要尝试控制其它页面；请让主流程重新 \`open-url\`（复用同一个 \`pageTargetId\`）再继续。
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
