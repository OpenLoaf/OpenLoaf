import { z } from "zod";

/** Maximum characters for test tool input. */
const MAX_INPUT_CHARS = 2000;

/** Tool definition for sub-agent testing. */
export const subAgentTestToolDef = {
  /** Tool id (single source of truth). */
  id: "sub-agent-test",
  /** Tool description for model routing. */
  description: "用于测试子 Agent 调用工具流程的回显工具（开发调试用）。",
  /** Tool parameter schema. */
  parameters: z.object({
    message: z
      .string()
      .min(1)
      .max(MAX_INPUT_CHARS)
      .describe("测试输入内容（子 Agent 会把它原样回显）。"),
  }),
  /** No custom UI component bound to this tool. */
  component: null,
} as const;
