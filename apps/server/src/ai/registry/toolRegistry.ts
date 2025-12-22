import { openUrlTool } from "@/ai/tools/ui/openUrl";
import { timeNowTool } from "@/ai/tools/system/timeNow";
import { subAgentTool } from "@/ai/tools/delegation/subAgentTool";
import { testApprovalTool } from "@/ai/tools/test/testApprovalTool";
import { resolveNeedsApproval, type ToolPolicyMeta } from "@/ai/registry/policies";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@teatime-ai/api/types/tools/browserAutomation";
import { timeNowToolDef } from "@teatime-ai/api/types/tools/system";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { testApprovalToolDef } from "@teatime-ai/api/types/tools/approvalTest";
import {
  browserActTool,
  browserExtractTool,
  browserObserveTool,
  browserSnapshotTool,
  browserWaitTool,
} from "@/ai/tools/browserAutomation/browserAutomationTools";

type ToolEntry = {
  tool: any;
  meta?: ToolPolicyMeta;
};

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  [timeNowToolDef.id]: {
    tool: timeNowTool,
    meta: { needsApproval: false },
  },
  [openUrlToolDef.id]: {
    tool: openUrlTool,
    meta: { needsApproval: false },
  },
  [subAgentToolDef.id]: {
    tool: subAgentTool,
    meta: { needsApproval: false },
  },
  [testApprovalToolDef.id]: {
    tool: testApprovalTool,
    meta: { needsApproval: true },
  },
  [browserSnapshotToolDef.id]: {
    tool: browserSnapshotTool,
    meta: { needsApproval: false },
  },
  [browserObserveToolDef.id]: {
    tool: browserObserveTool,
    meta: { needsApproval: false },
  },
  [browserExtractToolDef.id]: {
    tool: browserExtractTool,
    meta: { needsApproval: false },
  },
  [browserActToolDef.id]: {
    tool: browserActTool,
    meta: { needsApproval: false },
  },
  [browserWaitToolDef.id]: {
    tool: browserWaitTool,
    meta: { needsApproval: false },
  },
};

/**
 * Returns the tool instance by ToolDef.id (MVP).
 */
export function getToolById(toolId: string): ToolEntry | undefined {
  return TOOL_REGISTRY[toolId];
}

/**
 * Builds a ToolLoopAgent toolset from a list of ToolDef.id (MVP).
 */
export function buildToolset(toolIds: readonly string[]) {
  // AI SDK 的 ToolLoopAgent 需要一个 { [toolName]: tool } 的对象；这里严格用 ToolDef.id 作为 key。
  const toolset: Record<string, any> = {};
  for (const toolId of toolIds) {
    const entry = getToolById(toolId);
    if (!entry) continue;
    toolset[toolId] = entry.tool;
  }
  return toolset;
}

/**
 * Returns whether a tool requires approval (MVP).
 */
export function toolNeedsApproval(toolId: string): boolean {
  const entry = getToolById(toolId);
  return resolveNeedsApproval(entry?.meta);
}
