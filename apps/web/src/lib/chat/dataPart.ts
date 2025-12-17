"use client";

import { UI_EVENT_PART_TYPE } from "@teatime-ai/api/types/parts";
import { handleUiEvent } from "@/lib/chat/ui-event";

export function handleChatDataPart({
  dataPart,
  tabId,
  upsertToolPartMerged,
}: {
  dataPart: any;
  tabId: string | undefined;
  upsertToolPartMerged: (key: string, next: any) => void;
}) {
  // 后端 UI 事件（Streaming Custom Data）：统一入口，避免在各处散落 if/switch。
  if (dataPart?.type === UI_EVENT_PART_TYPE) {
    handleUiEvent(dataPart?.data);
    return;
  }

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
