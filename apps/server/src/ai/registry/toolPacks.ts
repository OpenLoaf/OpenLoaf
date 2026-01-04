import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { timeNowToolDef } from "@teatime-ai/api/types/tools/system";
import { testApprovalToolDef } from "@teatime-ai/api/types/tools/approvalTest";
import { subAgentTestToolDef } from "@teatime-ai/api/types/tools/subAgentTest";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@teatime-ai/api/types/tools/browserAutomation";

export type ToolPackId = "masterAgent" | "subAgent" | "browserSubAgent" | "testSubAgent";

/**
 * Tool packs define which tools an agent can use (MVP).
 */
export const toolPacks = {
  // 禁止在业务侧手写 tool id 字符串，统一引用 ToolDef.id（单一事实来源）。
  masterAgent: [
    timeNowToolDef.id,
    subAgentToolDef.id,
    testApprovalToolDef.id,
  ],
  subAgent: [],
  browserSubAgent: [
    openUrlToolDef.id,
    browserSnapshotToolDef.id,
    browserObserveToolDef.id,
    browserExtractToolDef.id,
    browserActToolDef.id,
    browserWaitToolDef.id,
  ],
  testSubAgent: [subAgentTestToolDef.id],
} as const satisfies Record<ToolPackId, readonly string[]>;
