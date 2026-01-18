import { openUrlTool } from "@/ai/tools/ui/openUrl";
import { timeNowTool } from "@/ai/tools/system/timeNowTool";
import { testApprovalTool } from "@/ai/tools/test/testApprovalTool";
import { subAgentTool } from "@/ai/tools/delegation/subAgentTool";
import { execCommandTool } from "@/ai/tools/runtime/execCommandTool";
import { shellTool } from "@/ai/tools/runtime/shellTool";
import { shellCommandTool } from "@/ai/tools/runtime/shellCommandTool";
import { writeStdinTool } from "@/ai/tools/runtime/writeStdinTool";
import { grepFilesTool, listDirTool, readFileTool } from "@/ai/tools/runtime/fileTools";
import { updatePlanTool } from "@/ai/tools/runtime/updatePlanTool";
import { resolveNeedsApproval, type ToolPolicyMeta } from "@/ai/registry/policies";
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@tenas-ai/api/types/tools/browserAutomation";
import { systemToolMeta, timeNowToolDef } from "@tenas-ai/api/types/tools/system";
import { testApprovalToolDef } from "@tenas-ai/api/types/tools/approvalTest";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";
import {
  grepFilesToolDef,
  listDirToolDef,
  readFileToolDef,
  shellCommandToolDefUnix,
  shellCommandToolDefWin,
  shellToolDefUnix,
  shellToolDefWin,
  execCommandToolDefUnix,
  execCommandToolDefWin,
  writeStdinToolDefUnix,
  writeStdinToolDefWin,
  updatePlanToolDef,
} from "@tenas-ai/api/types/tools/runtime";
import { RiskType } from "@tenas-ai/api/types/toolResult";
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

const isWindows = process.platform === "win32";
const shellToolDef = isWindows ? shellToolDefWin : shellToolDefUnix;
const shellCommandToolDef = isWindows ? shellCommandToolDefWin : shellCommandToolDefUnix;
const execCommandToolDef = isWindows ? execCommandToolDefWin : execCommandToolDefUnix;
const writeStdinToolDef = isWindows ? writeStdinToolDefWin : writeStdinToolDefUnix;

/** Build a tool entry from system tool meta. */
function buildSystemToolEntry(toolId: string, tool: any): ToolEntry {
  const riskType = (systemToolMeta as Record<string, { riskType: RiskType }>)[toolId]?.riskType;
  return {
    tool,
    meta: {
      riskType,
      // 逻辑：读操作无需审批，写入与破坏性操作需要审批。
      needsApproval: riskType === RiskType.Write || riskType === RiskType.Destructive,
    },
  };
}

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  [timeNowToolDef.id]: buildSystemToolEntry(timeNowToolDef.id, timeNowTool),
  [openUrlToolDef.id]: {
    tool: openUrlTool,
    meta: { needsApproval: false },
  },
  [testApprovalToolDef.id]: {
    tool: testApprovalTool,
    meta: { needsApproval: true },
  },
  [subAgentToolDef.id]: {
    tool: subAgentTool,
    meta: { needsApproval: false },
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
  [shellToolDef.id]: {
    tool: shellTool,
    meta: { needsApproval: true },
  },
  [shellCommandToolDef.id]: {
    tool: shellCommandTool,
    meta: { needsApproval: true },
  },
  [execCommandToolDef.id]: {
    tool: execCommandTool,
    meta: { needsApproval: true },
  },
  [writeStdinToolDef.id]: {
    tool: writeStdinTool,
    meta: { needsApproval: true },
  },
  [readFileToolDef.id]: {
    tool: readFileTool,
    meta: { needsApproval: false },
  },
  [listDirToolDef.id]: {
    tool: listDirTool,
    meta: { needsApproval: false },
  },
  [grepFilesToolDef.id]: {
    tool: grepFilesTool,
    meta: { needsApproval: false },
  },
  [updatePlanToolDef.id]: {
    tool: updatePlanTool,
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
