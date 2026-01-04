import { tool, zodSchema } from "ai";
import { subAgentTestToolDef } from "@teatime-ai/api/types/tools/subAgentTest";

/**
 * Simple echo tool for sub-agent flow testing.
 */
export const subAgentTestTool = tool({
  description: subAgentTestToolDef.description,
  inputSchema: zodSchema(subAgentTestToolDef.parameters),
  execute: async ({ message }) => {
    // 中文注释：原样回显输入，并附带服务端时间，便于验证工具调用链路。
    return {
      ok: true,
      echo: String(message ?? ""),
      timestamp: new Date().toISOString(),
    };
  },
});
