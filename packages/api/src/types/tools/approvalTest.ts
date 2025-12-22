import { z } from "zod";

export const testApprovalToolDef = {
  id: "test-approval",
  description: "用于测试审批流程：触发 needsApproval，并在审批通过后返回一个确认结果。",
  parameters: z.object({
    note: z.string().optional().describe("可选：测试备注（用于在输出中回显）。"),
  }),
  needsApproval: true,
  component: null,
} as const;

