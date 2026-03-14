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
import { testApprovalTool } from "@/ai/tools/testApprovalTool";
import {
  spawnAgentTool,
  sendInputTool,
  waitAgentTool,
  abortAgentTool,
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
import { excelQueryTool, excelMutateTool } from "@/ai/tools/excelTools";
import { wordQueryTool, wordMutateTool } from "@/ai/tools/wordTools";
import { pptxQueryTool, pptxMutateTool } from "@/ai/tools/pptxTools";
import { pdfQueryTool, pdfMutateTool } from "@/ai/tools/pdfTools";
import { imageGenerateTool, videoGenerateTool, listMediaModelsTool } from "@/ai/tools/mediaGenerateTools";
import { imageProcessTool } from "@/ai/tools/imageProcessTools";
import { videoConvertTool } from "@/ai/tools/videoConvertTools";
import { docConvertTool } from "@/ai/tools/docConvertTools";
import { fileInfoTool } from "@/ai/tools/fileInfoTool";
import { webSearchTool } from "@/ai/tools/webSearchTool";
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
import { testApprovalToolDef } from "@openloaf/api/types/tools/approvalTest";
import {
  spawnAgentToolDef,
  sendInputToolDef,
  waitAgentToolDef,
  abortAgentToolDef,
} from "@openloaf/api/types/tools/agent";
import { projectMutateToolDef, projectQueryToolDef } from "@openloaf/api/types/tools/db";
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
import { docConvertToolDef } from "@openloaf/api/types/tools/docConvert";
import { fileInfoToolDef } from "@openloaf/api/types/tools/fileInfo";
import { webSearchToolDef } from "@openloaf/api/types/tools/webSearch";
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
  shellToolDef,
  execCommandToolDef,
  writeStdinToolDef,
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
  [testApprovalToolDef.id]: {
    tool: testApprovalTool,
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
  [docConvertToolDef.id]: {
    tool: docConvertTool,
  },
  [fileInfoToolDef.id]: {
    tool: fileInfoTool,
  },
  [webSearchToolDef.id]: {
    tool: webSearchTool,
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

/** Common aliases for tool names that LLMs might use incorrectly. */
const TOOL_ALIASES: Record<string, string> = {
  shell: "shell-command",
  exec: "shell-command",
  run: "shell-command",
  "write-file": "apply-patch",
  "edit-file": "apply-patch",
  search: "grep-files",
  find: "grep-files",
  "create-task": "task-manage",
  "read-excel": "excel-query",
  "write-excel": "excel-mutate",
  "read-word": "word-query",
  "read-docx": "word-query",
  "write-word": "word-mutate",
  "create-word": "word-mutate",
  "read-pptx": "pptx-query",
  "read-ppt": "pptx-query",
  "write-pptx": "pptx-mutate",
  "create-pptx": "pptx-mutate",
  "create-ppt": "pptx-mutate",
  "read-pdf": "pdf-query",
  "write-pdf": "pdf-mutate",
  "create-pdf": "pdf-mutate",
  "merge-pdf": "pdf-mutate",
  "fill-pdf": "pdf-mutate",
  "resize-image": "image-process",
  "crop-image": "image-process",
  "convert-image": "image-process",
  "image-convert": "image-process",
  "convert-video": "video-convert",
  "extract-audio": "video-convert",
  "convert-document": "doc-convert",
  "document-convert": "doc-convert",
  "convert-doc": "doc-convert",
  "docx-to-pdf": "doc-convert",
  "pdf-to-docx": "doc-convert",
  "image-info": "file-info",
  "get-image-info": "file-info",
  "video-info": "file-info",
  "get-file-info": "file-info",
  "file-metadata": "file-info",
  "file-size": "file-info",
  "file-stat": "file-info",
  "pdf-to-word": "doc-convert",
  "word-to-pdf": "doc-convert",
  "html-to-md": "doc-convert",
  "md-to-pdf": "doc-convert",
  "csv-to-excel": "doc-convert",
  "excel-to-csv": "doc-convert",
  "search-web": "web-search",
  "internet-search": "web-search",
  "google": "web-search",
  "send-email": "email-mutate",
  "compose-email": "email-mutate",
  "delete-email": "email-mutate",
  "move-email": "email-mutate",
  "mark-read": "email-mutate",
  "flag-email": "email-mutate",
  "create-event": "calendar-mutate",
  "create-meeting": "calendar-mutate",
  "update-event": "calendar-mutate",
  "delete-event": "calendar-mutate",
  "create-reminder": "calendar-mutate",
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
  // AI SDK 的 ToolLoopAgent 需要一个 { [toolName]: tool } 的对象；这里严格用 ToolDef.id 作为 key。
  const toolset: Record<string, any> = {};
  for (const toolId of toolIds) {
    let entry = getToolById(toolId);
    if (!entry) {
      // 逻辑：工具名不存在时，检查是否为已知别名并自动映射。
      const canonical = TOOL_ALIASES[toolId];
      if (canonical) {
        entry = getToolById(canonical);
        if (entry) {
          // 用规范名称注册工具，同时为别名创建一个错误提示入口
          const withAutoApproval = wrapToolWithAutoApproval(canonical, entry.tool);
          const withTimeout = wrapToolWithTimeout(canonical, withAutoApproval);
          const withErrorEnhancer = wrapToolWithErrorEnhancer(canonical, withTimeout);
          toolset[canonical] = withErrorEnhancer;
        }
      }
      continue;
    }
    // 逻辑：依次包装 auto-approval → timeout → error enhancer，增强工具执行的可靠性。
    const withAutoApproval = wrapToolWithAutoApproval(toolId, entry.tool);
    const withTimeout = wrapToolWithTimeout(toolId, withAutoApproval);
    const withErrorEnhancer = wrapToolWithErrorEnhancer(toolId, withTimeout);
    toolset[toolId] = withErrorEnhancer;
  }
  return toolset;
}

/**
 * Suggest the canonical tool name for a given alias.
 * Returns the suggestion string if an alias matches, or null.
 */
export function suggestToolName(toolId: string): string | null {
  const canonical = TOOL_ALIASES[toolId];
  if (canonical) {
    return `Did you mean '${canonical}'? Use that instead.`;
  }
  return null;
}
