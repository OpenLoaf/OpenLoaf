import { openUrlTool } from "@/ai/tools/openUrl";
import { jsonRenderTool } from "@/ai/tools/jsonRenderTool";
import { timeNowTool } from "@/ai/tools/timeNowTool";
import { testApprovalTool } from "@/ai/tools/testApprovalTool";
import {
  spawnAgentTool,
  sendInputTool,
  waitAgentTool,
  closeAgentTool,
  resumeAgentTool,
} from "@/ai/tools/agentTools";
import { execCommandTool } from "@/ai/tools/execCommandTool";
import { shellTool } from "@/ai/tools/shellTool";
import { shellCommandTool } from "@/ai/tools/shellCommandTool";
import { writeStdinTool } from "@/ai/tools/writeStdinTool";
import { listDirTool, readFileTool, applyPatchTool } from "@/ai/tools/fileTools";
import { grepFilesTool } from "@/ai/tools/grepFilesTool";
import { editDocumentTool } from "@/ai/tools/documentTools";
import { generateWidgetTool } from "@/ai/tools/widgetTools";
import {
  widgetCheckTool,
  widgetGetTool,
  widgetInitTool,
  widgetListTool,
} from "@/ai/tools/widgetTools";
import { updatePlanTool } from "@/ai/tools/updatePlanTool";
import { projectMutateTool, projectQueryTool } from "@/ai/tools/projectTools";
import { calendarMutateTool, calendarQueryTool } from "@/ai/tools/calendarTools";
import { emailMutateTool, emailQueryTool } from "@/ai/tools/emailTools";
import { imageGenerateTool, videoGenerateTool } from "@/ai/tools/mediaGenerateTools";
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
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  closeAgentToolDef,
  resumeAgentToolDef,
} from "@tenas-ai/api/types/tools/agent";
import { projectMutateToolDef, projectQueryToolDef } from "@tenas-ai/api/types/tools/db";
import {
  calendarMutateToolDef,
  calendarQueryToolDef,
} from "@tenas-ai/api/types/tools/calendar";
import {
  emailMutateToolDef,
  emailQueryToolDef,
} from "@tenas-ai/api/types/tools/email";
import {
  imageGenerateToolDef,
  videoGenerateToolDef,
} from "@tenas-ai/api/types/tools/mediaGenerate";
import {
  listDirToolDef,
  readFileToolDef,
  applyPatchToolDef,
  editDocumentToolDef,
  grepFilesToolDef,
  shellCommandToolDef,
  shellToolDef,
  execCommandToolDef,
  writeStdinToolDef,
  updatePlanToolDef,
} from "@tenas-ai/api/types/tools/runtime";
import { generateWidgetToolDef } from "@tenas-ai/api/types/tools/widget";
import {
  widgetCheckToolDef,
  widgetGetToolDef,
  widgetInitToolDef,
  widgetListToolDef,
} from "@tenas-ai/api/types/tools/widget";
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
  [spawnAgentToolDef.id]: {
    tool: spawnAgentTool,
  },
  [sendInputToolDef.id]: {
    tool: sendInputTool,
  },
  [waitAgentToolDef.id]: {
    tool: waitAgentTool,
  },
  [closeAgentToolDef.id]: {
    tool: closeAgentTool,
  },
  [resumeAgentToolDef.id]: {
    tool: resumeAgentTool,
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
  [applyPatchToolDef.id]: {
    tool: applyPatchTool,
  },
  [editDocumentToolDef.id]: {
    tool: editDocumentTool,
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
  [projectQueryToolDef.id]: {
    tool: projectQueryTool,
  },
  [projectMutateToolDef.id]: {
    tool: projectMutateTool,
  },
  [calendarQueryToolDef.id]: {
    tool: calendarQueryTool,
  },
  [calendarMutateToolDef.id]: {
    tool: calendarMutateTool,
  },
  [emailQueryToolDef.id]: {
    tool: emailQueryTool,
  },
  [emailMutateToolDef.id]: {
    tool: emailMutateTool,
  },
  [generateWidgetToolDef.id]: {
    tool: generateWidgetTool,
  },
  [widgetInitToolDef.id]: {
    tool: widgetInitTool,
  },
  [widgetListToolDef.id]: {
    tool: widgetListTool,
  },
  [widgetGetToolDef.id]: {
    tool: widgetGetTool,
  },
  [widgetCheckToolDef.id]: {
    tool: widgetCheckTool,
  },
  [imageGenerateToolDef.id]: {
    tool: imageGenerateTool,
  },
  [videoGenerateToolDef.id]: {
    tool: videoGenerateTool,
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
