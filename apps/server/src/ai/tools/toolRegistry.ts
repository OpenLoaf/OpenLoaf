/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { openUrlTool } from "@/ai/tools/openUrl";
import { timeNowTool } from "@/ai/tools/timeNowTool";
import {
  spawnAgentTool,
  sendInputTool,
  waitAgentTool,
  abortAgentTool,
} from "@/ai/tools/agentTools";
import { shellCommandTool } from "@/ai/tools/shellCommandTool";
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
import { boardQueryTool, boardMutateTool } from "@/ai/tools/boardTools";
import { calendarMutateTool, calendarQueryTool } from "@/ai/tools/calendarTools";
import { emailMutateTool, emailQueryTool } from "@/ai/tools/emailTools";
import { excelQueryTool, excelMutateTool } from "@/ai/tools/excelTools";
import { wordQueryTool, wordMutateTool } from "@/ai/tools/wordTools";
import { pptxQueryTool, pptxMutateTool } from "@/ai/tools/pptxTools";
import { pdfQueryTool, pdfMutateTool } from "@/ai/tools/pdfTools";
import { imageGenerateTool, videoGenerateTool, listMediaModelsTool } from "@/ai/tools/mediaGenerateTools";
import { imageProcessTool } from "@/ai/tools/imageProcessTools";
import { videoConvertTool } from "@/ai/tools/videoConvertTools";
import { videoDownloadTool } from "@/ai/tools/videoDownloadTool";
import { docConvertTool } from "@/ai/tools/docConvertTools";
import { fileInfoTool } from "@/ai/tools/fileInfoTool";
import { webSearchTool } from "@/ai/tools/webSearchTool";
import { webFetchTool } from "@/ai/tools/webFetchTool";
import { loadSkillTool } from "@/ai/tools/loadSkillTool";
import { requestUserInputTool } from "@/ai/tools/requestUserInputTool";
import { jsxCreateTool } from "@/ai/tools/jsxCreateTool";
import { jsReplTool, jsReplResetTool } from "@/ai/tools/jsReplTool";
import { chartRenderTool } from "@/ai/tools/chartTools";
import { taskManageTool, taskStatusTool } from "@/ai/tools/taskTools";
import { memorySearchTool, memoryGetTool } from "@/ai/tools/memoryTools";
import { openUrlToolDef } from "@openloaf/api/types/tools/browser";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
  browserScreenshotToolDef,
  browserDownloadImageToolDef,
} from "@openloaf/api/types/tools/browserAutomation";
import { timeNowToolDef } from "@openloaf/api/types/tools/system";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "@openloaf/api/types/tools/agent";
import { projectMutateToolDef, projectQueryToolDef } from "@openloaf/api/types/tools/db";
import { boardQueryToolDef, boardMutateToolDef } from "@openloaf/api/types/tools/board";
import {
  calendarMutateToolDef,
  calendarQueryToolDef,
} from "@openloaf/api/types/tools/calendar";
import {
  emailMutateToolDef,
  emailQueryToolDef,
} from "@openloaf/api/types/tools/email";
import { excelQueryToolDef, excelMutateToolDef } from "@openloaf/api/types/tools/excel";
import { wordQueryToolDef, wordMutateToolDef } from "@openloaf/api/types/tools/word";
import { pptxQueryToolDef, pptxMutateToolDef } from "@openloaf/api/types/tools/pptx";
import { pdfQueryToolDef, pdfMutateToolDef } from "@openloaf/api/types/tools/pdf";
import {
  imageGenerateToolDef,
  videoGenerateToolDef,
  listMediaModelsToolDef,
} from "@openloaf/api/types/tools/mediaGenerate";
import { imageProcessToolDef } from "@openloaf/api/types/tools/imageProcess";
import { videoConvertToolDef } from "@openloaf/api/types/tools/videoConvert";
import { videoDownloadToolDef } from "@openloaf/api/types/tools/videoDownload";
import { docConvertToolDef } from "@openloaf/api/types/tools/docConvert";
import { fileInfoToolDef } from "@openloaf/api/types/tools/fileInfo";
import { webSearchToolDef } from "@openloaf/api/types/tools/webSearch";
import { webFetchToolDef } from "@openloaf/api/types/tools/webFetch";
import { loadSkillToolDef } from "@openloaf/api/types/tools/skill";
import { requestUserInputToolDef } from "@openloaf/api/types/tools/userInput";
import { jsxCreateToolDef } from "@openloaf/api/types/tools/jsxCreate";
import { chartRenderToolDef } from "@openloaf/api/types/tools/chart";
import {
  taskManageToolDef,
  taskStatusToolDef,
} from "@openloaf/api/types/tools/task";
import {
  memorySearchToolDef,
  memoryGetToolDef,
} from "@openloaf/api/types/tools/memory";
import {
  listDirToolDef,
  readFileToolDef,
  applyPatchToolDef,
  editDocumentToolDef,
  grepFilesToolDef,
  shellCommandToolDef,
  updatePlanToolDef,
  jsReplToolDef,
  jsReplResetToolDef,
} from "@openloaf/api/types/tools/runtime";
import { generateWidgetToolDef } from "@openloaf/api/types/tools/widget";
import {
  widgetCheckToolDef,
  widgetGetToolDef,
  widgetInitToolDef,
  widgetListToolDef,
} from "@openloaf/api/types/tools/widget";
import {
  browserActTool,
  browserExtractTool,
  browserObserveTool,
  browserSnapshotTool,
  browserWaitTool,
  browserScreenshotTool,
  browserDownloadImageTool,
} from "@/ai/tools/browserAutomationTools";
import { wrapToolWithTimeout } from "@/ai/tools/toolTimeout";
import { wrapToolWithErrorEnhancer } from "@/ai/tools/toolErrorEnhancer";
import { getRequestContext } from "@/ai/shared/context/requestContext";

type ToolEntry = {
  tool: any;
};

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  [timeNowToolDef.id]: { tool: timeNowTool },
  [openUrlToolDef.id]: {
    tool: openUrlTool,
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
  [abortAgentToolDef.id]: {
    tool: abortAgentTool,
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
  [browserScreenshotToolDef.id]: {
    tool: browserScreenshotTool,
  },
  [browserDownloadImageToolDef.id]: {
    tool: browserDownloadImageTool,
  },
  [shellCommandToolDef.id]: {
    tool: shellCommandTool,
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
  [boardQueryToolDef.id]: {
    tool: boardQueryTool,
  },
  [boardMutateToolDef.id]: {
    tool: boardMutateTool,
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
  [excelQueryToolDef.id]: {
    tool: excelQueryTool,
  },
  [excelMutateToolDef.id]: {
    tool: excelMutateTool,
  },
  [wordQueryToolDef.id]: {
    tool: wordQueryTool,
  },
  [wordMutateToolDef.id]: {
    tool: wordMutateTool,
  },
  [pptxQueryToolDef.id]: {
    tool: pptxQueryTool,
  },
  [pptxMutateToolDef.id]: {
    tool: pptxMutateTool,
  },
  [pdfQueryToolDef.id]: {
    tool: pdfQueryTool,
  },
  [pdfMutateToolDef.id]: {
    tool: pdfMutateTool,
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
  [listMediaModelsToolDef.id]: {
    tool: listMediaModelsTool,
  },
  [imageGenerateToolDef.id]: {
    tool: imageGenerateTool,
  },
  [videoGenerateToolDef.id]: {
    tool: videoGenerateTool,
  },
  [requestUserInputToolDef.id]: {
    tool: requestUserInputTool,
  },
  [jsxCreateToolDef.id]: {
    tool: jsxCreateTool,
  },
  [chartRenderToolDef.id]: {
    tool: chartRenderTool,
  },
  [jsReplToolDef.id]: {
    tool: jsReplTool,
  },
  [jsReplResetToolDef.id]: {
    tool: jsReplResetTool,
  },
  [taskManageToolDef.id]: {
    tool: taskManageTool,
  },
  [taskStatusToolDef.id]: {
    tool: taskStatusTool,
  },
  [imageProcessToolDef.id]: {
    tool: imageProcessTool,
  },
  [videoConvertToolDef.id]: {
    tool: videoConvertTool,
  },
  [videoDownloadToolDef.id]: {
    tool: videoDownloadTool,
  },
  [docConvertToolDef.id]: {
    tool: docConvertTool,
  },
  [fileInfoToolDef.id]: {
    tool: fileInfoTool,
  },
  [webSearchToolDef.id]: {
    tool: webSearchTool,
  },
  [webFetchToolDef.id]: {
    tool: webFetchTool,
  },
  [loadSkillToolDef.id]: {
    tool: loadSkillTool,
  },
  [memorySearchToolDef.id]: {
    tool: memorySearchTool,
  },
  [memoryGetToolDef.id]: {
    tool: memoryGetTool,
  },
};


/** Tool IDs excluded from auto-approval (complex/interactive). */
const AUTO_APPROVE_EXCLUDED_TOOLS = new Set(["request-user-input"]);

/** Wrap tool to skip needsApproval when autoApproveTools is enabled. */
function wrapToolWithAutoApproval(toolId: string, tool: any): any {
  if (AUTO_APPROVE_EXCLUDED_TOOLS.has(toolId)) return tool;
  const original = tool.needsApproval;
  if (original === undefined || original === false) return tool;
  return {
    ...tool,
    needsApproval: typeof original === "function"
      ? (...args: any[]) => {
          const ctx = getRequestContext();
          if (ctx?.autoApproveTools || ctx?.supervisionMode) return false;
          return (original as Function)(...args);
        }
      : () => {
          const ctx = getRequestContext();
          return !(ctx?.autoApproveTools || ctx?.supervisionMode);
        },
  };
}

/**
 * Returns the tool instance by ToolDef.id (MVP).
 */
function getToolById(toolId: string): ToolEntry | undefined {
  return TOOL_REGISTRY[toolId];
}

/**
 * Builds a ToolLoopAgent toolset from a list of ToolDef.id (MVP).
 *
 * Each tool is wrapped with:
 * 1. Timeout protection (prevents indefinite blocking)
 * 2. Error enhancement (structured recovery hints for LLM)
 */
export function buildToolset(toolIds: readonly string[] = []) {
  const toolset: Record<string, any> = {};
  for (const toolId of toolIds) {
    const entry = getToolById(toolId);
    if (!entry) continue;
    const withAutoApproval = wrapToolWithAutoApproval(toolId, entry.tool);
    const withTimeout = wrapToolWithTimeout(toolId, withAutoApproval);
    const withErrorEnhancer = wrapToolWithErrorEnhancer(toolId, withTimeout);
    toolset[toolId] = withErrorEnhancer;
  }
  return toolset;
}
