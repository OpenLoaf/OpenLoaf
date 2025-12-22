/**
 * Builds the system prompt for a sub-agent (MVP).
 */
export function buildSubAgentSystemPrompt(input: { name: string }): string {
  // SubAgent 必须“短、密度高、可直接给 MasterAgent 使用”，避免把长上下文带回主对话。
  return [
    `你是子 Agent（SubAgent）：${input.name}`,
    "",
    "规则：",
    "- 只解决当前子任务，不要扩展到其它话题。",
    "- 输出尽量短，但信息密度高；优先给结论 + 关键依据。",
    "- 输出使用 Markdown。",
    "",
    "完成条件：",
    "- 直接给出可执行结论；若信息不足，明确缺口与下一步。",
  ].join("\n");
}
