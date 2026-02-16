"use client";

import type { UIMessage } from "@ai-sdk/react";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

// 逻辑：记录已推送 StreamingCodeViewer 的 toolCallId，避免重复推送。
const pushedWriteFileViewers = new Set<string>();
// 逻辑：记录已推送 StreamingPlateViewer 的 toolCallId，避免重复推送。
const pushedEditDocViewers = new Set<string>();

// 关键：从 messages.parts 同步 tool 状态到 zustand（用于 ToolResultPanel 展示）
export function syncToolPartsFromMessages({
  tabId,
  messages,
}: {
  tabId: string | undefined;
  messages: UIMessage[];
}) {
  if (!tabId) return;
  const upsertToolPart = useChatRuntime.getState().upsertToolPart;

  for (const message of messages) {
    const messageId = typeof message.id === "string" ? message.id : "m";
    const parts = (message as any).parts ?? [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const type = typeof part?.type === "string" ? part.type : "";
      const isTool = type === "dynamic-tool" || type.startsWith("tool-");
      if (!isTool) continue;
      const toolKey = String(part.toolCallId ?? `${messageId}:${index}`);
      const current = useChatRuntime.getState().toolPartsByTabId[tabId]?.[toolKey];
      upsertToolPart(tabId, toolKey, { ...current, ...part } as any);

      // 逻辑：检测 write-file 工具流式状态，自动在 stack 中打开 StreamingCodeViewer。
      // AI SDK 在 message.parts 中不设 toolName 字段，工具名编码在 type 中：type === "tool-write-file"。
      // 仅在 input-streaming 状态时推送，避免加载历史时为已完成的 write-file 打开面板。
      const isWriteFile = type === "tool-write-file";
      const state = typeof part?.state === "string" ? part.state : "";
      if (
        isWriteFile &&
        state === "input-streaming" &&
        !pushedWriteFileViewers.has(toolKey)
      ) {
        pushedWriteFileViewers.add(toolKey);
        const input = part?.input;
        const path = typeof input?.path === "string" ? input.path : "";
        const fileName = path ? (path.split("/").pop() || path) : "";
        useTabRuntime.getState().pushStackItem(tabId, {
          id: `streaming-write:${toolKey}`,
          sourceKey: `streaming-write:${toolKey}`,
          component: "streaming-code-viewer",
          title: fileName || "写入文件...",
          params: { toolCallId: toolKey, tabId, __isStreaming: true },
        });
      }
      // 逻辑：path 可能在后续 delta 中才解析出来，更新标题。
      if (
        isWriteFile &&
        pushedWriteFileViewers.has(toolKey) &&
        part?.input?.path
      ) {
        const path = String(part.input.path);
        const fileName = path.split("/").pop() || path;
        const stackId = `streaming-write:${toolKey}`;
        const runtime = useTabRuntime.getState().runtimeByTabId[tabId];
        const existing = runtime?.stack?.find(
          (s: any) => s.id === stackId || s.sourceKey === stackId,
        );
        if (existing && existing.title !== fileName) {
          useTabRuntime.getState().pushStackItem(tabId, {
            id: stackId,
            sourceKey: stackId,
            component: "streaming-code-viewer",
            title: fileName,
            params: { toolCallId: toolKey, tabId, __isStreaming: true },
          });
        }
      }
      // 逻辑：write-file 完成时，关闭 stack 面板的流式边框。
      if (
        isWriteFile &&
        pushedWriteFileViewers.has(toolKey) &&
        (state === "input-available" || state === "output-available" || state === "output-error")
      ) {
        const stackId = `streaming-write:${toolKey}`;
        useTabRuntime.getState().setStackItemParams(tabId, stackId, {
          __isStreaming: false,
        });
      }

      // 逻辑：检测 edit-document 工具流式状态，自动在 stack 中打开 StreamingPlateViewer。
      const isEditDocument = type === "tool-edit-document";
      if (
        isEditDocument &&
        state === "input-streaming" &&
        !pushedEditDocViewers.has(toolKey)
      ) {
        pushedEditDocViewers.add(toolKey);
        const editInput = part?.input;
        const editPath = typeof editInput?.path === "string" ? editInput.path : "";
        const editFileName = editPath ? (editPath.split("/").pop() || editPath) : "";
        useTabRuntime.getState().pushStackItem(tabId, {
          id: `streaming-edit-doc:${toolKey}`,
          sourceKey: `streaming-edit-doc:${toolKey}`,
          component: "streaming-plate-viewer",
          title: editFileName || "编辑文稿...",
          params: { toolCallId: toolKey, tabId, __isStreaming: true },
        });
      }
      // 逻辑：edit-document path 可能在后续 delta 中才解析出来，更新标题。
      if (
        isEditDocument &&
        pushedEditDocViewers.has(toolKey) &&
        part?.input?.path
      ) {
        const editPath = String(part.input.path);
        const editFileName = editPath.split("/").pop() || editPath;
        const editStackId = `streaming-edit-doc:${toolKey}`;
        const editRuntime = useTabRuntime.getState().runtimeByTabId[tabId];
        const editExisting = editRuntime?.stack?.find(
          (s: any) => s.id === editStackId || s.sourceKey === editStackId,
        );
        if (editExisting && editExisting.title !== editFileName) {
          useTabRuntime.getState().pushStackItem(tabId, {
            id: editStackId,
            sourceKey: editStackId,
            component: "streaming-plate-viewer",
            title: editFileName,
            params: { toolCallId: toolKey, tabId, __isStreaming: true },
          });
        }
      }
      // 逻辑：edit-document 完成时，关闭 stack 面板的流式边框。
      if (
        isEditDocument &&
        pushedEditDocViewers.has(toolKey) &&
        (state === "input-available" || state === "output-available" || state === "output-error")
      ) {
        const editStackId = `streaming-edit-doc:${toolKey}`;
        useTabRuntime.getState().setStackItemParams(tabId, editStackId, {
          __isStreaming: false,
        });
      }
    }
  }
}
