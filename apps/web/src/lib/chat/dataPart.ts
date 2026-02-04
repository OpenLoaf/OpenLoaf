"use client";

import { useChatRuntime } from "@/hooks/use-chat-runtime";

export function handleChatDataPart({
  dataPart,
  tabId,
  upsertToolPartMerged,
}: {
  dataPart: any;
  tabId: string | undefined;
  upsertToolPartMerged: (key: string, next: any) => void;
}) {
  // AI SDK 内置的 tool streaming chunks：单独处理（用于 ToolResultPanel 渲染）。
  handleToolChunk({ dataPart, tabId, upsertToolPartMerged });
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
