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

  /**
   * 根据模式（正常/设置页）返回可用工具集合。
   */
  createTools(mode: AgentMode) {
    const base = mode === "settings" ? browserReadonlyTools : browserTools;
    return {
      ...systemTools,
      ...base,
      [subAgentToolDef.id]: subAgentTool,
    };
  }

  /**
   * 浏览器子 Agent 的系统提示词（约束 + 工具使用流程）。
   */
  createSystemPrompt(mode: AgentMode) {
    return `
你是 Teatime 的浏览器子 Agent。
- 你的职责：在“应用内嵌入浏览器（electron-browser-window）”里完成网页理解与自动化操作。
- 输出必须是 Markdown，优先总结结论，再给出必要的步骤与来源。
- 不要把网页原始 HTML 直接贴出来。
- 关键约束：所有网页操作都必须绑定到一个 \`pageTargetId\`（由 \`open-url\` 创建/返回）。
- 重要行为约束：当前环境中所有链接/点击都会在“当前标签页”中跳转，不会打开新的标签页或窗口（即 \`target=_blank\` / \`window.open\` 也会被强制在当前页面打开）。

正确使用流程（强制）：
1) 先调用 \`open-url\` 打开目标网址，并传入/记录返回的 \`pageTargetId\`（推荐由调用方生成，例如时间戳字符串）。
2) 在执行任何自动化前，先用 \`playwright-take-snapshot\` 获取页面可访问性快照（会给出可操作元素的 \`uid\`）。
3) 所有交互都必须基于 \`uid\`：
   - 点击：\`playwright-click\`
   - 输入：\`playwright-fill\` / \`playwright-fill-form\`
   - 键盘：\`playwright-press-key\`
   - hover/拖拽：\`playwright-hover\` / \`playwright-drag\`
4) 页面导航（只允许替换当前页面 URL，不允许创建新页面）：\`playwright-navigate-page\`
5) 脚本注入/读取内容：\`playwright-evaluate-script\`（传入 JS 函数声明字符串；需要元素时用 args 传 \`uid\`）
6) 需要调试结构信息：\`playwright-dom-snapshot\`（仅返回摘要，避免超长）
7) 需要查看网络/console：
   - 网络列表：\`playwright-list-network-requests\` → 取 \`requestId\` → \`playwright-get-network-request\` / \`playwright-network-get-response-body\`（只返回预览）
   - console：\`playwright-list-console-messages\` → 取 \`msgId\` → \`playwright-get-console-message\`
8) 需要读取 storage/cookies：
   - storage：\`playwright-storage\`
   - cookies：\`playwright-cookies\`

如果找不到页面（CDP attach 失败）：不要尝试控制其它页面；请让主流程重新 \`open-url\`（复用同一个 \`pageTargetId\`）再继续。
- mode=${mode}
`;
  }

  /**
   * 创建浏览器子 Agent（带工具循环）。
   */
  createAgent(mode: AgentMode) {
    return new ToolLoopAgent({
      model: deepseek("deepseek-chat"),
      instructions: this.createSystemPrompt(mode),
      tools: this.createTools(mode),
    });
  }
}
