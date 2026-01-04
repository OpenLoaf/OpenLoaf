/**
 * Builds the system prompt for the test sub-agent (MVP).
 */
export function buildTestSubAgentSystemPrompt(input: { name: string }): string {
  // 子 Agent 用于验证工具调用流程，必须至少调用一次测试工具。
  return [
    `你是子 Agent（Test SubAgent）：${input.name}`,
    "",
    "任务：",
    "- 必须调用一次 sub-agent-test 工具，传入简短 message。",
    "- 工具返回后，输出一句简短总结。",
    "",
    "规则：",
    "- 输出使用 Markdown。",
    "- 不要展开无关内容。",
  ].join("\n");
}
