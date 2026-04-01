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
import {
  agentTool,
  sendMessageTool,
} from "@/ai/tools/agentTools";
import { bashTool } from "@/ai/tools/shellCommandTool";
import { readTool, editTool, writeTool } from "@/ai/tools/fileTools";
import { grepTool } from "@/ai/tools/grepTool";
import { globTool } from "@/ai/tools/globTool";
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
import { memorySaveTool, memorySearchTool, memoryGetTool } from "@/ai/tools/memoryTools";
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
import {
  agentToolDef,
  sendMessageToolDef,
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
  memorySaveToolDef,
  memorySearchToolDef,
  memoryGetToolDef,
} from "@openloaf/api/types/tools/memory";
import {
  bashToolDef,
  readToolDef,
  editToolDef,
  writeToolDef,
  globToolDef,
  grepToolDef,
  editDocumentToolDef,
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
import { wrapToolWithInputValidation } from "@/ai/tools/toolInputValidation";
import { getRequestContext } from "@/ai/shared/context/requestContext";
import { zodSchema } from "ai";

type ToolEntry = {
  tool: any;
};

// ---------------------------------------------------------------------------
// MCP Dynamic Tool Registry
// ---------------------------------------------------------------------------

/**
 * Runtime-mutable registry for MCP tools.
 * Native tools remain in the static TOOL_REGISTRY; MCP tools live here so
 * they can be registered / unregistered as MCP servers connect & disconnect.
 */
const MCP_TOOL_REGISTRY = new Map<string, ToolEntry>()

/** Register an MCP tool at runtime (called by MCPClientManager on connect). */
export function registerMcpTool(toolId: string, toolInstance: any): void {
  MCP_TOOL_REGISTRY.set(toolId, { tool: toolInstance })
}

/** Unregister an MCP tool at runtime (called on MCP server disconnect). */
export function unregisterMcpTool(toolId: string): void {
  MCP_TOOL_REGISTRY.delete(toolId)
}

/** Unregister all MCP tools for a given server (prefix match). */
export function unregisterMcpToolsByServer(serverName: string): void {
  const prefix = `mcp__${serverName}__`
  for (const id of MCP_TOOL_REGISTRY.keys()) {
    if (id.startsWith(prefix)) MCP_TOOL_REGISTRY.delete(id)
  }
}

/** Get all currently registered MCP tool IDs. */
export function getMcpToolIds(): string[] {
  return [...MCP_TOOL_REGISTRY.keys()]
}

/** Check if a tool ID belongs to the MCP registry. */
export function isMcpTool(toolId: string): boolean {
  return toolId.startsWith('mcp__')
}

// ---------------------------------------------------------------------------
// Static Native Tool Registry
// ---------------------------------------------------------------------------

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  [openUrlToolDef.id]: {
    tool: openUrlTool,
  },
  [agentToolDef.id]: {
    tool: agentTool,
  },
  [sendMessageToolDef.id]: {
    tool: sendMessageTool,
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
  [bashToolDef.id]: {
    tool: bashTool,
  },
  [readToolDef.id]: {
    tool: readTool,
  },
  [editToolDef.id]: {
    tool: editTool,
  },
  [writeToolDef.id]: {
    tool: writeTool,
  },
  [editDocumentToolDef.id]: {
    tool: editDocumentTool,
  },
  [globToolDef.id]: {
    tool: globTool,
  },
  [grepToolDef.id]: {
    tool: grepTool,
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
  [memorySaveToolDef.id]: {
    tool: memorySaveTool,
  },
  [memorySearchToolDef.id]: {
    tool: memorySearchTool,
  },
  [memoryGetToolDef.id]: {
    tool: memoryGetTool,
  },
};


// ---------------------------------------------------------------------------
// Tool definition registry — maps toolId → ToolDef (with parameters zod schema).
// Used by tool-search to return full parameter schemas to the model.
// ---------------------------------------------------------------------------

const TOOL_DEF_REGISTRY: Record<string, { parameters?: any }> = {
  [openUrlToolDef.id]: openUrlToolDef,
  [agentToolDef.id]: agentToolDef,
  [sendMessageToolDef.id]: sendMessageToolDef,
  [browserSnapshotToolDef.id]: browserSnapshotToolDef,
  [browserObserveToolDef.id]: browserObserveToolDef,
  [browserExtractToolDef.id]: browserExtractToolDef,
  [browserActToolDef.id]: browserActToolDef,
  [browserWaitToolDef.id]: browserWaitToolDef,
  [browserScreenshotToolDef.id]: browserScreenshotToolDef,
  [browserDownloadImageToolDef.id]: browserDownloadImageToolDef,
  [bashToolDef.id]: bashToolDef,
  [readToolDef.id]: readToolDef,
  [editToolDef.id]: editToolDef,
  [writeToolDef.id]: writeToolDef,
  [editDocumentToolDef.id]: editDocumentToolDef,
  [globToolDef.id]: globToolDef,
  [grepToolDef.id]: grepToolDef,
  [updatePlanToolDef.id]: updatePlanToolDef,
  [projectQueryToolDef.id]: projectQueryToolDef,
  [projectMutateToolDef.id]: projectMutateToolDef,
  [boardQueryToolDef.id]: boardQueryToolDef,
  [boardMutateToolDef.id]: boardMutateToolDef,
  [calendarQueryToolDef.id]: calendarQueryToolDef,
  [calendarMutateToolDef.id]: calendarMutateToolDef,
  [emailQueryToolDef.id]: emailQueryToolDef,
  [emailMutateToolDef.id]: emailMutateToolDef,
  [excelQueryToolDef.id]: excelQueryToolDef,
  [excelMutateToolDef.id]: excelMutateToolDef,
  [wordQueryToolDef.id]: wordQueryToolDef,
  [wordMutateToolDef.id]: wordMutateToolDef,
  [pptxQueryToolDef.id]: pptxQueryToolDef,
  [pptxMutateToolDef.id]: pptxMutateToolDef,
  [pdfQueryToolDef.id]: pdfQueryToolDef,
  [pdfMutateToolDef.id]: pdfMutateToolDef,
  [generateWidgetToolDef.id]: generateWidgetToolDef,
  [widgetInitToolDef.id]: widgetInitToolDef,
  [widgetListToolDef.id]: widgetListToolDef,
  [widgetGetToolDef.id]: widgetGetToolDef,
  [widgetCheckToolDef.id]: widgetCheckToolDef,
  [requestUserInputToolDef.id]: requestUserInputToolDef,
  [jsxCreateToolDef.id]: jsxCreateToolDef,
  [chartRenderToolDef.id]: chartRenderToolDef,
  [jsReplToolDef.id]: jsReplToolDef,
  [jsReplResetToolDef.id]: jsReplResetToolDef,
  [taskManageToolDef.id]: taskManageToolDef,
  [taskStatusToolDef.id]: taskStatusToolDef,
  [imageProcessToolDef.id]: imageProcessToolDef,
  [videoConvertToolDef.id]: videoConvertToolDef,
  [videoDownloadToolDef.id]: videoDownloadToolDef,
  [docConvertToolDef.id]: docConvertToolDef,
  [fileInfoToolDef.id]: fileInfoToolDef,
  [webSearchToolDef.id]: webSearchToolDef,
  [webFetchToolDef.id]: webFetchToolDef,
  [loadSkillToolDef.id]: loadSkillToolDef,
  [memorySaveToolDef.id]: memorySaveToolDef,
  [memorySearchToolDef.id]: memorySearchToolDef,
  [memoryGetToolDef.id]: memoryGetToolDef,
};

/**
 * Returns simplified JSON schemas for the requested tool IDs.
 * Used by tool-search to include parameter definitions in its response,
 * so the model knows exactly what parameters to pass.
 */
export function getToolJsonSchemas(toolIds: string[]): Record<string, object> {
  const result: Record<string, object> = {}
  for (const id of toolIds) {
    const resolved = resolveToolId(id)
    const def = TOOL_DEF_REGISTRY[resolved]
    if (!def?.parameters) continue
    try {
      const full = zodSchema(def.parameters).jsonSchema as Record<string, unknown>
      // Strip verbose fields — keep type, properties, required only
      const { $schema: _, additionalProperties: __, ...clean } = full
      result[id] = clean
    } catch {
      // Skip tools with non-standard schemas
    }
  }
  return result
}

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

// ---------------------------------------------------------------------------
// 工具 ID 别名 — 旧 ID → 新 ID 映射，兼容旧代码和已有对话历史
// ---------------------------------------------------------------------------

const TOOL_ALIASES: Record<string, string> = {
  'shell-command': 'Bash',
  'read-file': 'Read',
  'apply-patch': 'Edit',
  'list-dir': 'Glob',
  'grep-files': 'Grep',
  'web-search': 'WebSearch',
  'web-fetch': 'WebFetch',
}

/** 解析工具 ID，优先使用别名映射到新 ID。 */
function resolveToolId(toolId: string): string {
  return TOOL_ALIASES[toolId] ?? toolId
}

/**
 * Returns the tool instance by ToolDef.id.
 * Checks the static native registry first, then the dynamic MCP registry.
 * Supports legacy tool ID aliases for backward compatibility.
 */
function getToolById(toolId: string): ToolEntry | undefined {
  const resolved = resolveToolId(toolId)
  return TOOL_REGISTRY[resolved] ?? MCP_TOOL_REGISTRY.get(resolved);
}

/**
 * Builds a ToolLoopAgent toolset from a list of ToolDef.id (MVP).
 *
 * Each tool is wrapped with:
 * 1. Input validation passthrough (converts schema errors → tool execution errors for LLM feedback)
 * 2. Timeout protection (prevents indefinite blocking)
 * 3. Error enhancement (structured recovery hints for LLM)
 */
export function buildToolset(toolIds: readonly string[] = []) {
  const toolset: Record<string, any> = {};
  for (const rawToolId of toolIds) {
    const toolId = resolveToolId(rawToolId)
    const entry = getToolById(toolId);
    if (!entry) continue;

    let toolInstance = entry.tool

    // MCP tools skip approval — they are user-configured external services
    if (isMcpTool(toolId)) {
      toolInstance = { ...toolInstance, needsApproval: undefined }
    }

    const withAutoApproval = wrapToolWithAutoApproval(toolId, toolInstance);
    const withInputValidation = wrapToolWithInputValidation(toolId, withAutoApproval);
    const withTimeout = wrapToolWithTimeout(toolId, withInputValidation);
    const withErrorEnhancer = wrapToolWithErrorEnhancer(toolId, withTimeout);
    toolset[toolId] = withErrorEnhancer;
  }
  return toolset;
}
