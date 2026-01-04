import { timeNowToolDef } from "@teatime-ai/api/types/tools/system";
import { testApprovalToolDef } from "@teatime-ai/api/types/tools/approvalTest";

export type ToolPackId = "masterAgent";

/**
 * Tool packs define which tools an agent can use (MVP).
 */
export const toolPacks = {
  // 禁止在业务侧手写 tool id 字符串，统一引用 ToolDef.id（单一事实来源）。
  masterAgent: [
    timeNowToolDef.id,
    testApprovalToolDef.id,
  ],
} as const satisfies Record<ToolPackId, readonly string[]>;
