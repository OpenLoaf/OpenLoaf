import { z } from "zod";

export const testApprovalToolDef = {
  id: "test-approval",
  name: "审批测试",
  description: "用于测试审批流程：触发 needsApproval，并在审批通过后返回一个确认结果。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：测试审批流程。"),
    note: z.string().optional().describe("可选：测试备注（用于在输出中回显）。"),
  }),
  needsApproval: true,
  component: null,
} as const;
