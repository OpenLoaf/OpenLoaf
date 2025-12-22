import { tool, zodSchema } from "ai";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";

/**
 * sub-agent tool（MVP）：
 * - 兼容旧 prompt/工具列表，当前版本已禁用子 agent 能力
 */
export const subAgentTool = tool({
  description: subAgentToolDef.description,
  inputSchema: zodSchema(subAgentToolDef.parameters),
  execute: async () => {
    // browser worker / browser automation 链路已移除，避免旧对话提示词调用时报错，保留占位返回。
    return { ok: false, error: { code: "DISABLED", message: "subAgent 已禁用。" } };
  },
});
