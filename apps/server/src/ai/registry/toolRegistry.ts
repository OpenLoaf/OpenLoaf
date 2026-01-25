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
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@tenas-ai/api/types/tools/browserAutomation";
import { timeNowToolDef } from "@tenas-ai/api/types/tools/system";
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
import {
  browserActTool,
  browserExtractTool,
  browserObserveTool,
  browserSnapshotTool,
  browserWaitTool,
} from "@/ai/tools/browserAutomation/browserAutomationTools";

type ToolEntry = {
  tool: any;
};

const isWindows = process.platform === "win32";
const shellToolDef = isWindows ? shellToolDefWin : shellToolDefUnix;
const shellCommandToolDef = isWindows ? shellCommandToolDefWin : shellCommandToolDefUnix;
const execCommandToolDef = isWindows ? execCommandToolDefWin : execCommandToolDefUnix;
const writeStdinToolDef = isWindows ? writeStdinToolDefWin : writeStdinToolDefUnix;

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  [timeNowToolDef.id]: { tool: timeNowTool },
  [openUrlToolDef.id]: {
    tool: openUrlTool,
  },
  [testApprovalToolDef.id]: {
    tool: testApprovalTool,
  },
  [subAgentToolDef.id]: {
    tool: subAgentTool,
  },
  [browserSnapshotToolDef.id]: {
    tool: browserSnapshotTool,
  },
  [browserObserveToolDef.id]: {
    tool: browserObserveTool,
  },
  [browserExtractToolDef.id]: {
    tool: browserExtractTool,
  },
  [browserActToolDef.id]: {
    tool: browserActTool,
  },
  [browserWaitToolDef.id]: {
    tool: browserWaitTool,
  },
  [shellToolDef.id]: {
    tool: shellTool,
  },
  [shellCommandToolDef.id]: {
    tool: shellCommandTool,
  },
  [execCommandToolDef.id]: {
    tool: execCommandTool,
  },
  [writeStdinToolDef.id]: {
    tool: writeStdinTool,
  },
  [readFileToolDef.id]: {
    tool: readFileTool,
  },
  [listDirToolDef.id]: {
    tool: listDirTool,
  },
  [grepFilesToolDef.id]: {
    tool: grepFilesTool,
  },
  [updatePlanToolDef.id]: {
    tool: updatePlanTool,
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
export function buildToolset(toolIds: readonly string[] = []) {
  // AI SDK 的 ToolLoopAgent 需要一个 { [toolName]: tool } 的对象；这里严格用 ToolDef.id 作为 key。
  const toolset: Record<string, any> = {};
  for (const toolId of toolIds) {
    const entry = getToolById(toolId);
    if (!entry) continue;
    toolset[toolId] = entry.tool;
  }
  return toolset;
}
