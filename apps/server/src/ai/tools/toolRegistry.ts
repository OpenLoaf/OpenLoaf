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
import { powerShellTool } from "@/ai/tools/powershell/powerShellTool";
import { readTool, editTool, writeTool } from "@/ai/tools/fileTools";
import { docPreviewTool } from "@/ai/tools/docPreviewTools";
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
import { submitPlanTool } from "@/ai/tools/submitPlanTool";
import { savePlanDraftTool } from "@/ai/tools/savePlanDraftTool";
import { projectMutateTool, projectQueryTool } from "@/ai/tools/projectTools";
import { boardQueryTool, boardMutateTool } from "@/ai/tools/boardTools";
import { calendarMutateTool, calendarQueryTool } from "@/ai/tools/calendarTools";
import { emailMutateTool, emailQueryTool } from "@/ai/tools/emailTools";
import { excelMutateTool } from "@/ai/tools/excelTools";
import { wordMutateTool } from "@/ai/tools/wordTools";
import { pptxMutateTool } from "@/ai/tools/pptxTools";
import { pdfMutateTool, pdfInspectTool } from "@/ai/tools/pdfTools";
import { imageProcessTool } from "@/ai/tools/imageProcessTools";
import { videoConvertTool } from "@/ai/tools/videoConvertTools";
import { videoDownloadTool } from "@/ai/tools/videoDownloadTool";
import { docConvertTool } from "@/ai/tools/docConvertTools";
import { fileInfoTool } from "@/ai/tools/fileInfoTool";
import { webSearchTool, isWebSearchConfigured } from "@/ai/tools/webSearchTool";
import { webFetchTool } from "@/ai/tools/webFetchTool";
import { loadSkillTool } from "@/ai/tools/loadSkillTool";
import { requestUserInputTool } from "@/ai/tools/requestUserInputTool";
import { jsxCreateTool } from "@/ai/tools/jsxCreateTool";
import { chartRenderTool } from "@/ai/tools/chartTools";
import { scheduledTaskManageTool, scheduledTaskStatusTool, scheduledTaskWaitTool } from "@/ai/tools/scheduleTools";
import { bgListTool, bgKillTool } from "@/ai/tools/bgTaskTools";
import { sleepTool } from "@/ai/tools/sleepTool";
import { memorySaveTool } from "@/ai/tools/memoryTools";
import {
  cloudLoginTool,
  cloudUserInfoTool,
  cloudTaskCancelTool,
  cloudTaskTool,
} from "@/ai/tools/cloud/cloudTools";
import {
  cloudImageGenerateTool,
  cloudImageEditTool,
  cloudVideoGenerateTool,
  cloudTTSTool,
  cloudSpeechRecognizeTool,
  cloudImageUnderstandTool,
  enhanceCloudNamedToolDescription,
} from "@/ai/tools/cloud/cloudNamedTools";
import { openUrlToolDef } from "@openloaf/api/types/tools/browser";
import {
  browserActToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
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
import { excelMutateToolDef } from "@openloaf/api/types/tools/excel";
import { wordMutateToolDef } from "@openloaf/api/types/tools/word";
import { pptxMutateToolDef } from "@openloaf/api/types/tools/pptx";
import { pdfMutateToolDef, pdfInspectToolDef } from "@openloaf/api/types/tools/pdf";
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
  scheduledTaskManageToolDef,
  scheduledTaskStatusToolDef,
  scheduledTaskWaitToolDef,
} from "@openloaf/api/types/tools/scheduledTask";
import {
  bgListToolDef,
  bgKillToolDef,
} from "@openloaf/api/types/tools/bgTask";
import { sleepToolDef } from "@openloaf/api/types/tools/sleep";
import { memorySaveToolDef } from "@openloaf/api/types/tools/memory";
import {
  cloudLoginToolDef,
  cloudUserInfoToolDef,
  cloudTaskCancelToolDef,
  cloudTaskToolDef,
  cloudImageGenerateToolDef,
  cloudImageEditToolDef,
  cloudVideoGenerateToolDef,
  cloudTTSToolDef,
  cloudSpeechRecognizeToolDef,
  cloudImageUnderstandToolDef,
} from "@openloaf/api/types/tools/cloud";
import {
  bashToolDef,
  powerShellToolDef,
  readToolDef,
  editToolDef,
  writeToolDef,
  globToolDef,
  grepToolDef,
  editDocumentToolDef,
  submitPlanToolDef,
  savePlanDraftToolDef,
} from "@openloaf/api/types/tools/runtime";
import { docPreviewToolDef } from "@openloaf/api/types/tools/docPreview";
import { generateWidgetToolDef } from "@openloaf/api/types/tools/widget";
import {
  widgetCheckToolDef,
  widgetGetToolDef,
  widgetInitToolDef,
  widgetListToolDef,
} from "@openloaf/api/types/tools/widget";
import {
  browserActTool,
  browserSnapshotTool,
  browserWaitTool,
  browserDownloadImageTool,
} from "@/ai/tools/browserAutomationTools";
import {
  getCloudToolEntry,
  getCloudToolDef,
  getCloudToolIds,
} from "@/ai/tools/cloud/cloudToolsDynamic";
import { wrapToolWithTimeout } from "@/ai/tools/toolTimeout";
import { wrapToolWithErrorEnhancer } from "@/ai/tools/toolErrorEnhancer";
import { wrapToolWithInputValidation } from "@/ai/tools/toolInputValidation";
import { getRequestContext } from "@/ai/shared/context/requestContext";
import { evaluateToolRules } from "@/ai/tools/toolApprovalMatcher";
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
  [browserActToolDef.id]: {
    tool: browserActTool,
  },
  [browserWaitToolDef.id]: {
    tool: browserWaitTool,
  },
  [browserDownloadImageToolDef.id]: {
    tool: browserDownloadImageTool,
  },
  [bashToolDef.id]: {
    tool: bashTool,
  },
  [powerShellToolDef.id]: {
    tool: powerShellTool,
  },
  [readToolDef.id]: {
    tool: readTool,
  },
  [docPreviewToolDef.id]: {
    tool: docPreviewTool,
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
  [submitPlanToolDef.id]: {
    tool: submitPlanTool,
  },
  [savePlanDraftToolDef.id]: {
    tool: savePlanDraftTool,
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
  [excelMutateToolDef.id]: {
    tool: excelMutateTool,
  },
  [wordMutateToolDef.id]: {
    tool: wordMutateTool,
  },
  [pptxMutateToolDef.id]: {
    tool: pptxMutateTool,
  },
  [pdfMutateToolDef.id]: {
    tool: pdfMutateTool,
  },
  [pdfInspectToolDef.id]: {
    tool: pdfInspectTool,
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
  [scheduledTaskManageToolDef.id]: {
    tool: scheduledTaskManageTool,
  },
  [scheduledTaskStatusToolDef.id]: {
    tool: scheduledTaskStatusTool,
  },
  [scheduledTaskWaitToolDef.id]: {
    tool: scheduledTaskWaitTool,
  },
  [bgListToolDef.id]: {
    tool: bgListTool,
  },
  [bgKillToolDef.id]: {
    tool: bgKillTool,
  },
  [sleepToolDef.id]: {
    tool: sleepTool,
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
  [cloudTaskToolDef.id]: {
    tool: cloudTaskTool,
  },
  [cloudTaskCancelToolDef.id]: {
    tool: cloudTaskCancelTool,
  },
  [cloudUserInfoToolDef.id]: {
    tool: cloudUserInfoTool,
  },
  [cloudLoginToolDef.id]: {
    tool: cloudLoginTool,
  },
  [cloudImageGenerateToolDef.id]: {
    tool: cloudImageGenerateTool,
  },
  [cloudImageEditToolDef.id]: {
    tool: cloudImageEditTool,
  },
  [cloudVideoGenerateToolDef.id]: {
    tool: cloudVideoGenerateTool,
  },
  [cloudTTSToolDef.id]: {
    tool: cloudTTSTool,
  },
  [cloudSpeechRecognizeToolDef.id]: {
    tool: cloudSpeechRecognizeTool,
  },
  [cloudImageUnderstandToolDef.id]: {
    tool: cloudImageUnderstandTool,
  },
};


// ---------------------------------------------------------------------------
// Tool definition registry — maps toolId → ToolDef (with parameters zod schema).
// Used by ToolSearch to return full parameter schemas to the model.
// ---------------------------------------------------------------------------

const TOOL_DEF_REGISTRY: Record<string, { parameters?: any }> = {
  [openUrlToolDef.id]: openUrlToolDef,
  [agentToolDef.id]: agentToolDef,
  [sendMessageToolDef.id]: sendMessageToolDef,
  [browserSnapshotToolDef.id]: browserSnapshotToolDef,
  [browserActToolDef.id]: browserActToolDef,
  [browserWaitToolDef.id]: browserWaitToolDef,
  [browserDownloadImageToolDef.id]: browserDownloadImageToolDef,
  [bashToolDef.id]: bashToolDef,
  [powerShellToolDef.id]: powerShellToolDef,
  [readToolDef.id]: readToolDef,
  [docPreviewToolDef.id]: docPreviewToolDef,
  [editToolDef.id]: editToolDef,
  [writeToolDef.id]: writeToolDef,
  [editDocumentToolDef.id]: editDocumentToolDef,
  [globToolDef.id]: globToolDef,
  [grepToolDef.id]: grepToolDef,
  [submitPlanToolDef.id]: submitPlanToolDef,
  [savePlanDraftToolDef.id]: savePlanDraftToolDef,
  [projectQueryToolDef.id]: projectQueryToolDef,
  [projectMutateToolDef.id]: projectMutateToolDef,
  [boardQueryToolDef.id]: boardQueryToolDef,
  [boardMutateToolDef.id]: boardMutateToolDef,
  [calendarQueryToolDef.id]: calendarQueryToolDef,
  [calendarMutateToolDef.id]: calendarMutateToolDef,
  [emailQueryToolDef.id]: emailQueryToolDef,
  [emailMutateToolDef.id]: emailMutateToolDef,
  [excelMutateToolDef.id]: excelMutateToolDef,
  [wordMutateToolDef.id]: wordMutateToolDef,
  [pptxMutateToolDef.id]: pptxMutateToolDef,
  [pdfMutateToolDef.id]: pdfMutateToolDef,
  [pdfInspectToolDef.id]: pdfInspectToolDef,
  [generateWidgetToolDef.id]: generateWidgetToolDef,
  [widgetInitToolDef.id]: widgetInitToolDef,
  [widgetListToolDef.id]: widgetListToolDef,
  [widgetGetToolDef.id]: widgetGetToolDef,
  [widgetCheckToolDef.id]: widgetCheckToolDef,
  [requestUserInputToolDef.id]: requestUserInputToolDef,
  [jsxCreateToolDef.id]: jsxCreateToolDef,
  [chartRenderToolDef.id]: chartRenderToolDef,
  [scheduledTaskManageToolDef.id]: scheduledTaskManageToolDef,
  [scheduledTaskStatusToolDef.id]: scheduledTaskStatusToolDef,
  [scheduledTaskWaitToolDef.id]: scheduledTaskWaitToolDef,
  [bgListToolDef.id]: bgListToolDef,
  [bgKillToolDef.id]: bgKillToolDef,
  [sleepToolDef.id]: sleepToolDef,
  [imageProcessToolDef.id]: imageProcessToolDef,
  [videoConvertToolDef.id]: videoConvertToolDef,
  [videoDownloadToolDef.id]: videoDownloadToolDef,
  [docConvertToolDef.id]: docConvertToolDef,
  [fileInfoToolDef.id]: fileInfoToolDef,
  [webSearchToolDef.id]: webSearchToolDef,
  [webFetchToolDef.id]: webFetchToolDef,
  [loadSkillToolDef.id]: loadSkillToolDef,
  [memorySaveToolDef.id]: memorySaveToolDef,
  [cloudTaskToolDef.id]: cloudTaskToolDef,
  [cloudTaskCancelToolDef.id]: cloudTaskCancelToolDef,
  [cloudUserInfoToolDef.id]: cloudUserInfoToolDef,
  [cloudLoginToolDef.id]: cloudLoginToolDef,
  [cloudImageGenerateToolDef.id]: cloudImageGenerateToolDef,
  [cloudImageEditToolDef.id]: cloudImageEditToolDef,
  [cloudVideoGenerateToolDef.id]: cloudVideoGenerateToolDef,
  [cloudTTSToolDef.id]: cloudTTSToolDef,
  [cloudSpeechRecognizeToolDef.id]: cloudSpeechRecognizeToolDef,
  [cloudImageUnderstandToolDef.id]: cloudImageUnderstandToolDef,
};

/**
 * Returns simplified JSON schemas for the requested tool IDs.
 * Used by ToolSearch to include parameter definitions in its response,
 * so the model knows exactly what parameters to pass.
 */
export function getToolJsonSchemas(toolIds: string[]): Record<string, object> {
  const result: Record<string, object> = {}
  for (const id of toolIds) {
    const resolved = resolveToolId(id)
    const def = preferCloudOverStatic(resolved)
      ? (getCloudToolDef(resolved) ?? TOOL_DEF_REGISTRY[resolved])
      : (TOOL_DEF_REGISTRY[resolved] ?? getCloudToolDef(resolved))
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

/**
 * Cloud tool ids registered at runtime (tools category features). Consumed
 * by agentFactory so these ids show up in allToolIds / ToolSearch catalog.
 */
export function getRuntimeCloudToolIds(): string[] {
  return getCloudToolIds()
}

/** Tool IDs excluded from auto-approval (complex/interactive). */
const AUTO_APPROVE_EXCLUDED_TOOLS = new Set(["AskUserQuestion"]);

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
 * Wrap tool so user-configured allow/deny rules override the default
 * needsApproval decision. The rules come from requestContext, which is
 * populated in chatStreamHelpers:initRequestContext according to scope:
 *   - project chat → project.json aiSettings.toolApprovalRules
 *   - temporary chat → global tool-approval.json
 *
 * Semantics (mirrors toolApprovalMatcher.evaluateToolRules):
 *   - deny matched → force approval (user can still reject at prompt)
 *   - allow matched → skip approval
 *   - unmatched → defer to original needsApproval (tool's built-in policy)
 */
function wrapToolWithUserRules(toolId: string, tool: any): any {
  if (AUTO_APPROVE_EXCLUDED_TOOLS.has(toolId)) return tool;
  const original = tool.needsApproval;
  return {
    ...tool,
    needsApproval: (...args: any[]) => {
      const rules = getRequestContext()?.toolApprovalRules;
      if (rules) {
        const input = (args[0] ?? {}) as Record<string, unknown>;
        const verdict = evaluateToolRules(rules, toolId, input);
        if (verdict === "deny") return true;
        if (verdict === "allow") return false;
      }
      if (typeof original === "function") {
        return (original as Function)(...args);
      }
      return original === true;
    },
  };
}

// ---------------------------------------------------------------------------
// 工具 ID 别名 — 旧 ID → 新 ID 映射，兼容旧代码和已有对话历史
// ---------------------------------------------------------------------------

const TOOL_ALIASES: Record<string, string> = {
  'shell-command': process.platform === 'win32' ? 'PowerShell' : 'Bash',
  'read-file': 'Read',
  'apply-patch': 'Edit',
  'list-dir': 'Glob',
  'grep-files': 'Grep',
  'web-search': 'WebSearch',
  'web-fetch': 'WebFetch',
  'BgList': 'Jobs',
  'BgKill': 'Kill',
}

/** 解析工具 ID，优先使用别名映射到新 ID。 */
function resolveToolId(toolId: string): string {
  return TOOL_ALIASES[toolId] ?? toolId
}

/**
 * Tools that have both a static (native) implementation and a dynamic cloud
 * implementation. Which one is authoritative depends on config — e.g.
 * WebSearch uses the Jina static tool only when a provider + API key are
 * configured; otherwise the SaaS cloud tool takes over under the same
 * canonical id. For these, cloud registration is preferred whenever the
 * static prerequisite check fails, so a stale static entry never shadows
 * the dynamic one that's actually usable.
 */
function preferCloudOverStatic(resolved: string): boolean {
  if (resolved === 'WebSearch') return !isWebSearchConfigured()
  return false
}

/**
 * Returns the tool instance by ToolDef.id.
 * Checks the static native registry, the dynamic MCP registry, then the
 * runtime cloud tools registry (populated by startCloudToolsPreloadLoop).
 * Supports legacy tool ID aliases for backward compatibility. For
 * dual-implementation tools (see preferCloudOverStatic), the cloud entry
 * is consulted first when the static prerequisite is not met.
 */
function getToolById(toolId: string): ToolEntry | undefined {
  const resolved = resolveToolId(toolId)
  if (preferCloudOverStatic(resolved)) {
    const cloud = getCloudToolEntry(resolved)
    if (cloud) return cloud
  }
  return (
    TOOL_REGISTRY[resolved] ??
    MCP_TOOL_REGISTRY.get(resolved) ??
    getCloudToolEntry(resolved)
  );
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

    const withUserRules = wrapToolWithUserRules(toolId, toolInstance);
    const withAutoApproval = wrapToolWithAutoApproval(toolId, withUserRules);
    const withInputValidation = wrapToolWithInputValidation(toolId, withAutoApproval);
    const withTimeout = wrapToolWithTimeout(toolId, withInputValidation);
    const withErrorEnhancer = wrapToolWithErrorEnhancer(toolId, withTimeout);
    // 动态 description — 给 Cloud 命名工具追加当前可用 variant 的 <system-tag>，
    // 让模型在 tool schema 里就能看到 variant 列表，自行决定 modelHint。
    // 每次 agent 创建时 rebuild，保证拿到最新的 capability snapshot。
    const enhancedDesc = enhanceCloudNamedToolDescription(
      toolId,
      withErrorEnhancer.description ?? "",
    );
    const finalTool =
      enhancedDesc === (withErrorEnhancer.description ?? "")
        ? withErrorEnhancer
        : { ...withErrorEnhancer, description: enhancedDesc };
    toolset[toolId] = finalTool;
  }
  return toolset;
}
