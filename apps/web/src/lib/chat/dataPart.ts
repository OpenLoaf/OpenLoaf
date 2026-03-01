/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

export function handleChatDataPart({
  dataPart,
  tabId,
  upsertToolPartMerged,
}: {
  dataPart: any;
  tabId: string | undefined;
  upsertToolPartMerged: (key: string, next: any) => void;
}) {
  // Claude Code runtime events：拦截 data-cc-* 并路由到 Zustand store。
  if (handleClaudeCodeDataPart({ dataPart, tabId })) return;
  // AI SDK 内置的 tool streaming chunks：单独处理（用于 ToolResultPanel 渲染）。
  handleToolChunk({ dataPart, tabId, upsertToolPartMerged });
}

/** Handle Claude Code runtime data parts. Returns true if consumed. */
function handleClaudeCodeDataPart({
  dataPart,
  tabId,
}: {
  dataPart: any;
  tabId: string | undefined;
}): boolean {
  const type = typeof dataPart?.type === "string" ? dataPart.type : "";
  if (!type.startsWith("data-cc-") || !tabId) return false;

  const { updateCcRuntime } = useChatRuntime.getState();
  const data = dataPart?.data ?? {};

  switch (type) {
    case "data-cc-init": {
      updateCcRuntime(tabId, {
        init: {
          model: data.model ?? "",
          tools: Array.isArray(data.tools) ? data.tools : [],
          mcpServers: Array.isArray(data.mcpServers) ? data.mcpServers : [],
          claudeCodeVersion: data.claudeCodeVersion ?? "",
          cwd: data.cwd ?? "",
        },
      });
      break;
    }
    case "data-cc-status": {
      updateCcRuntime(tabId, { status: data.status ?? null });
      break;
    }
    case "data-cc-tool-progress": {
      const toolUseId = data.toolUseId;
      if (!toolUseId) break;
      const current = useChatRuntime.getState().ccRuntimeByTabId[tabId];
      updateCcRuntime(tabId, {
        toolProgress: {
          ...(current?.toolProgress ?? {}),
          [toolUseId]: {
            toolName: data.toolName ?? "unknown",
            elapsedSeconds: data.elapsedSeconds ?? 0,
          },
        },
      });
      break;
    }
    case "data-cc-task-started": {
      const taskId = data.taskId;
      if (!taskId) break;
      const current = useChatRuntime.getState().ccRuntimeByTabId[tabId];
      updateCcRuntime(tabId, {
        tasks: {
          ...(current?.tasks ?? {}),
          [taskId]: {
            description: data.description ?? "",
            status: "running",
          },
        },
      });
      break;
    }
    case "data-cc-task-progress": {
      const taskId = data.taskId;
      if (!taskId) break;
      const current = useChatRuntime.getState().ccRuntimeByTabId[tabId];
      const existing = current?.tasks?.[taskId];
      updateCcRuntime(tabId, {
        tasks: {
          ...(current?.tasks ?? {}),
          [taskId]: {
            description: data.description ?? existing?.description ?? "",
            status: existing?.status ?? "running",
            lastToolName: data.lastToolName,
          },
        },
      });
      break;
    }
    case "data-cc-task-done": {
      const taskId = data.taskId;
      if (!taskId) break;
      const current = useChatRuntime.getState().ccRuntimeByTabId[tabId];
      const existing = current?.tasks?.[taskId];
      updateCcRuntime(tabId, {
        tasks: {
          ...(current?.tasks ?? {}),
          [taskId]: {
            description: existing?.description ?? "",
            status: data.status ?? "completed",
            summary: data.summary,
          },
        },
      });
      break;
    }
    case "data-cc-rate-limit": {
      updateCcRuntime(tabId, {
        rateLimit: {
          status: data.status ?? "allowed",
          resetsAt: data.resetsAt,
          utilization: data.utilization,
        },
      });
      break;
    }
    case "data-cc-result": {
      updateCcRuntime(tabId, {
        result: {
          subtype: data.subtype ?? "",
          totalCostUsd: data.totalCostUsd ?? 0,
          numTurns: data.numTurns ?? 0,
          durationMs: data.durationMs ?? 0,
          errors: Array.isArray(data.errors) ? data.errors : [],
          permissionDenials: Array.isArray(data.permissionDenials) ? data.permissionDenials : [],
        },
        // 清除瞬态进度状态
        toolProgress: {},
        status: null,
      });
      break;
    }
    case "data-cc-plan-file": {
      const filePath = data.filePath as string;
      const title = (data.title as string) || "Plan";
      useTabRuntime.getState().pushStackItem(tabId, {
        id: `cc-plan-${filePath}`,
        component: "markdown-viewer",
        title,
        params: {
          uri: filePath,
          name: title,
          ext: "md",
          __customHeader: true,
          readOnly: true,
        },
      });
      break;
    }
    case "data-cc-plan-ready": {
      updateCcRuntime(tabId, { status: "plan-ready" });
      break;
    }
    case "data-cc-user-question": {
      updateCcRuntime(tabId, {
        userQuestion: {
          sessionId: data.sessionId as string,
          toolUseId: data.toolUseId as string,
          questions: Array.isArray(data.questions) ? data.questions : [],
          answered: false,
        },
      });
      break;
    }
    default:
      break;
  }

  return true;
}

function handleToolChunk({
  dataPart,
  tabId,
  upsertToolPartMerged,
}: {
  dataPart: any;
  tabId: string | undefined;
  upsertToolPartMerged: (key: string, next: any) => void;
}) {
  // MVP：tool parts（用于 ToolResultPanel 渲染）
  if (!tabId) return;
  switch (dataPart?.type) {
    case "data-cli-thinking-delta": {
      const payload = dataPart?.data ?? {};
      const toolCallId = typeof payload?.toolCallId === "string" ? payload.toolCallId : "";
      const delta = typeof payload?.delta === "string" ? payload.delta : "";
      if (!toolCallId || !delta) break;
      const toolKey = String(toolCallId);
      const current = useChatRuntime.getState().toolPartsByTabId[tabId]?.[toolKey];
      const currentOutput = typeof current?.output === "string" ? current.output : "";
      // 逻辑：CLI delta 追加到当前输出，保证可实时刷新工具面板。
      upsertToolPartMerged(toolKey, {
        variant: "cli-thinking",
        type: current?.type ?? "tool-cli-thinking",
        toolCallId,
        toolName: current?.toolName ?? "shell",
        title: current?.title ?? "CLI 输出",
        state: "output-streaming",
        streaming: true,
        output: `${currentOutput}${delta}`,
      });
      break;
    }
    // 注意：tool-input-start / tool-input-delta / tool-input-available / tool-output-available
    // 由 AI SDK v6 内部处理，不会传递到 onData 回调。
    // 这些 case 保留用于兼容可能直接调用 handleChatDataPart 的场景。
    case "tool-input-start": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        type: dataPart.dynamic ? "dynamic-tool" : `tool-${dataPart.toolName}`,
        toolCallId: dataPart.toolCallId,
        toolName: dataPart.toolName,
        title: dataPart.title,
        state: "input-streaming",
        streaming: true,
      });
      break;
    }
    case "tool-input-delta": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "input-streaming",
        streaming: true,
      });
      break;
    }
    case "tool-input-available": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        type: dataPart.dynamic ? "dynamic-tool" : `tool-${dataPart.toolName}`,
        toolCallId: dataPart.toolCallId,
        toolName: dataPart.toolName,
        title: dataPart.title,
        state: "input-available",
        input: dataPart.input,
      });
      break;
    }
    case "tool-approval-request": {
      const approvalId =
        typeof dataPart?.approvalId === "string" ? dataPart.approvalId : "";
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "approval-requested",
        ...(approvalId ? { approval: { id: approvalId } } : {}),
      });
      break;
    }
    case "tool-output-available": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "output-available",
        output: dataPart.output,
        streaming: false,
      });
      break;
    }
    case "tool-output-error": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "output-error",
        errorText: dataPart.errorText,
        streaming: false,
      });
      break;
    }
    case "tool-output-denied": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "output-denied",
        streaming: false,
      });
      break;
    }
    case "tool-input-error": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        type: dataPart.dynamic ? "dynamic-tool" : `tool-${dataPart.toolName}`,
        toolCallId: dataPart.toolCallId,
        toolName: dataPart.toolName,
        title: dataPart.title,
        state: "output-error",
        input: dataPart.input,
        errorText: dataPart.errorText,
        streaming: false,
      });
      break;
    }
    default:
      break;
  }
}
