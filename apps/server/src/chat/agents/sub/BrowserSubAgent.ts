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
    return {
      ...browserTools,
      ...systemTools,
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
- 关键参数：所有 Playwright/CDP 工具都必须传入 \`targetId\`（即 \`open-url\` 返回的 \`cdpTargetId\`），用于精确 attach 到目标标签页，避免多 tab 串页。
- 重要行为约束：当前环境中所有链接/点击都会在“当前标签页”中跳转，不会打开新的标签页或窗口（即 \`target=_blank\` / \`window.open\` 也会被强制在当前页面打开）。

正确使用流程（强制）：
1) 先调用 \`open-url\` 打开目标网址，并拿到 \`pageTargetId\` 与 \`cdpTargetId\`。
   - 后续所有 Playwright/CDP 工具：\`pageTargetId\` 固定不变，\`targetId = cdpTargetId\` 必传。
2) 在执行任何自动化前，先用 \`playwright-snapshot\` 获取页面可访问性快照（会给出可操作节点与推荐 selector）。
3) 所有交互都优先基于 snapshot 输出的推荐 selector（尤其是 role selector：\`role=button[name="..."]\`），不要凭空猜 CSS selector：
   - 统一动作：\`playwright-act\`（click/fill/type/press/hover/select/check/uncheck/scrollIntoView）
4) 强同步：每次 \`playwright-act\` 后都要做一次等待/验证，形成闭环：
   - 等待：\`playwright-wait\`（url/text/selector/load/networkidle/timeout）
   - 验证：\`playwright-verify\`（urlIncludes/titleIncludes/textIncludes/elementExists/elementEnabled）
5) 失败自救：当动作失败或验证不通过时，先调用 \`playwright-diagnostics\` 获取证据（console/network/urlTitle），再重新 snapshot 定位下一步。
6) 页面控制：\`playwright-page\`（navigate/reload/back/forward），仅影响当前页面，不创建新页面。

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
