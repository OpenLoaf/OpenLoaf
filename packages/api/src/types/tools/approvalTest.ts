/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { z } from "zod";

export const testApprovalToolDef = {
  id: "test-approval",
  name: "审批测试",
  description:
    "触发：当你需要验证审批按钮/回执流程是否正常（开发/测试）时调用，不用于真实业务数据收集。用途：强制进入审批流程并等待用户通过/拒绝。返回：通过时 { ok: true, data: { approvedAt, note? } }；若用户拒绝则无结果并终止本次调用。",
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
