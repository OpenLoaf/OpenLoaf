"use client";

import { UI_EVENT_PART_TYPE } from "@teatime-ai/api/types/parts";
import { useTabs } from "@/hooks/use-tabs";

export function handleChatDataPart({
  dataPart,
  tabId,
  upsertToolPartMerged,
}: {
  dataPart: any;
  tabId: string | undefined;
  upsertToolPartMerged: (key: string, next: any) => void;
}) {
  // MVP：后端 UI 事件（Streaming Custom Data）
  if (dataPart?.type === UI_EVENT_PART_TYPE) {
    const event = dataPart?.data;
    if (event?.kind === "push-stack-item" && event?.tabId && event?.item) {
      useTabs.getState().pushStackItem(event.tabId, event.item);
    }
    return;
  }

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
