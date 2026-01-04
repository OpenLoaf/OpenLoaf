import { tool, zodSchema } from "ai";
import { testApprovalToolDef } from "@teatime-ai/api/types/tools/approvalTest";

type TestApprovalToolOutput = {
  ok: true;
  data: {
    note?: string;
    approvedAt: string;
  };
};

/**
 * Test tool for approval flow (MVP).
 */
export const testApprovalTool = tool({
  description: testApprovalToolDef.description,
  inputSchema: zodSchema(testApprovalToolDef.parameters),
  // 这是一个“必定触发审批”的测试工具，用于验证审批与 UI approve/deny。
  needsApproval: true,
  execute: async ({ note }): Promise<TestApprovalToolOutput> => {
    return { ok: true, data: { note, approvedAt: new Date().toISOString() } };
  },
});
