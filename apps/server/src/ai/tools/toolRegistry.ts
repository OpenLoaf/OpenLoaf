import { openUrlTool } from "@/ai/tools/openUrl";
import { jsonRenderTool } from "@/ai/tools/jsonRenderTool";
import { timeNowTool } from "@/ai/tools/timeNowTool";
import { testApprovalTool } from "@/ai/tools/testApprovalTool";
import { subAgentTool } from "@/ai/tools/subAgentTool";
import { execCommandTool } from "@/ai/tools/execCommandTool";
import { shellTool } from "@/ai/tools/shellTool";
import { shellCommandTool } from "@/ai/tools/shellCommandTool";
import { writeStdinTool } from "@/ai/tools/writeStdinTool";
import { listDirTool, readFileTool, writeFileTool } from "@/ai/tools/fileTools";
import { updatePlanTool } from "@/ai/tools/updatePlanTool";
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
import { jsonRenderToolDef } from "@tenas-ai/api/types/tools/jsonRender";
import { subAgentToolDef } from "@tenas-ai/api/types/tools/subAgent";
import {
  listDirToolDef,
  readFileToolDef,
  writeFileToolDef,
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
} from "@/ai/tools/browserAutomationTools";

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
  [jsonRenderToolDef.id]: {
    tool: jsonRenderTool,
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
  [writeFileToolDef.id]: {
    tool: writeFileTool,
  },
  [listDirToolDef.id]: {
    tool: listDirTool,
  },
  [updatePlanToolDef.id]: {
    tool: updatePlanTool,
  },
};

/**
 * Returns the tool instance by ToolDef.id (MVP).
 */
function getToolById(toolId: string): ToolEntry | undefined {
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
