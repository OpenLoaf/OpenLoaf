"use client";

import { manualStopToolDef } from "@teatime-ai/api/types/tools/system";

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
    case "data-manual-stop": {
      const toolCallId = String(dataPart.data?.toolCallId ?? "");
      if (!toolCallId) break;
      const reason =
        typeof dataPart.data?.reason === "string" && dataPart.data.reason.trim()
          ? dataPart.data.reason
          : "用户手动中断";
      // 将手动中断映射为工具卡片，便于 UI 展示与回放。
      upsertToolPartMerged(toolCallId, {
        type: `tool-${manualStopToolDef.id}`,
        toolCallId,
        toolName: manualStopToolDef.id,
        state: "output-available",
        output: reason,
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
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "approval-requested",
      });
      break;
    }
    case "tool-output-available": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "output-available",
        output: dataPart.output,
      });
      break;
    }
    case "tool-output-error": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "output-error",
        errorText: dataPart.errorText,
      });
      break;
    }
    case "tool-output-denied": {
      upsertToolPartMerged(String(dataPart.toolCallId), {
        state: "output-denied",
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
      });
      break;
    }
    default:
      break;
  }
}
