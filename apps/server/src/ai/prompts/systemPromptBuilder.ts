import { getWorkspaceId } from "@/ai/chat-stream/requestContext";

/**
 * Builds the system prompt for the master agent (MVP).
 */
export function buildMasterAgentSystemPrompt(): string {
  const workspaceId = getWorkspaceId() ?? "unknown";

  // 按“目标/环境/工具/规则/完成条件”分段，方便后续扩展与测试。
  const sections = [
    [
      "你是 Tenas 的 AI 助手（MasterAgent）。",
      "- 输出必须是 Markdown。",
      "- 优先使用工具完成用户指令，必要时再做解释。",
    ].join("\n"),
    ["环境：", `- workspaceId: ${workspaceId}`].join("\n"),
    [
      "规则：",
      "- 不要捏造事实；不知道就说明并建议用工具获取信息。",
      "- 工具返回的数据需要简要总结后再继续下一步。",
      "- 任务较复杂时可以调用 sub-agent 工具拆分处理。",
    ].join("\n"),
    ["完成条件：", "- 用户问题被解决，或给出明确下一步操作。"].join("\n"),
  ];

  return sections.join("\n\n");
}
