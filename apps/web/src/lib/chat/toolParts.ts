"use client";

import type { UIMessage } from "@ai-sdk/react";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { getTabViewById } from "@/hooks/use-tab-view";
import { extractPatchFileInfo } from "@/lib/chat/patch-utils";

// 逻辑：按文件路径分组 write-file stack，同文件复用同一个 stack panel。
const writeFileStackByPath = new Map<string, string>(); // filePath → stackId
const toolCallIdToStackId = new Map<string, string>(); // toolCallId → stackId
const processedWriteFileTools = new Set<string>(); // 已处理的 toolCallId
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
      // 同文件的多次 write-file 合并到同一个 stack panel（通过 toolCallIds 数组）。
      const isWriteFile = type === "tool-write-file";
      const state = typeof part?.state === "string" ? part.state : "";
      if (
        isWriteFile &&
        state === "input-streaming" &&
        !processedWriteFileTools.has(toolKey)
      ) {
        processedWriteFileTools.add(toolKey);
        const input = part?.input;
        const patchText = typeof input?.patch === "string" ? input.patch : "";
        const { fileName, firstPath } = extractPatchFileInfo(patchText);
        const tabView = tabId ? getTabViewById(tabId) : undefined;
        const workspaceId = tabView?.workspaceId ?? "";
        const baseParams = useTabRuntime.getState().runtimeByTabId[tabId]?.base?.params as Record<string, unknown> | undefined;
        const projectId = typeof baseParams?.projectId === "string" ? baseParams.projectId : undefined;

        if (firstPath && writeFileStackByPath.has(firstPath)) {
          // 逻辑：同文件已有 stack → 追加 toolCallId 到已有 stack 的 toolCallIds[]。
          const existingStackId = writeFileStackByPath.get(firstPath)!;
          const rt = useTabRuntime.getState().runtimeByTabId[tabId];
          const item = rt?.stack?.find((s: any) => s.id === existingStackId);
          const ids = (item?.params?.toolCallIds as string[]) ?? [];
          if (!ids.includes(toolKey)) {
            useTabRuntime.getState().setStackItemParams(tabId, existingStackId, {
              toolCallIds: [...ids, toolKey],
              __isStreaming: true,
            });
          }
          toolCallIdToStackId.set(toolKey, existingStackId);
        } else {
          // 逻辑：新文件 → 创建新 stack，params 用 toolCallIds 数组。
          const stackId = `streaming-write:${toolKey}`;
          useTabRuntime.getState().pushStackItem(tabId, {
            id: stackId,
            sourceKey: stackId,
            component: "streaming-code-viewer",
            title: firstPath ? fileName : "写入文件...",
            params: { toolCallIds: [toolKey], tabId, workspaceId, projectId, __isStreaming: true },
          });
          toolCallIdToStackId.set(toolKey, stackId);
          if (firstPath) writeFileStackByPath.set(firstPath, stackId);
        }
      }
      // 逻辑：patch 路径延迟可用时，更新标题并检查是否需要合并到已有 stack。
      if (
        isWriteFile &&
        processedWriteFileTools.has(toolKey) &&
        part?.input?.patch
      ) {
        const patchText = String(part.input.patch);
        const { fileName, firstPath } = extractPatchFileInfo(patchText);
        if (firstPath) {
          const myStackId = toolCallIdToStackId.get(toolKey);
          const existingStackId = writeFileStackByPath.get(firstPath);

          if (existingStackId && existingStackId !== myStackId && myStackId) {
            // 逻辑：路径对应的 stack 已存在且不是当前 stack → 合并。
            const rt = useTabRuntime.getState().runtimeByTabId[tabId];
            const targetItem = rt?.stack?.find((s: any) => s.id === existingStackId);
            const targetIds = (targetItem?.params?.toolCallIds as string[]) ?? [];
            if (!targetIds.includes(toolKey)) {
              useTabRuntime.getState().setStackItemParams(tabId, existingStackId, {
                toolCallIds: [...targetIds, toolKey],
                __isStreaming: true,
              });
            }
            // 逻辑：从旧 stack 移除此 toolCallId，若为空则删除整个 stack。
            const oldItem = rt?.stack?.find((s: any) => s.id === myStackId);
            const oldIds = (oldItem?.params?.toolCallIds as string[]) ?? [];
            const remaining = oldIds.filter((id: string) => id !== toolKey);
            if (remaining.length === 0) {
              useTabRuntime.getState().removeStackItem(tabId, myStackId);
            } else {
              useTabRuntime.getState().setStackItemParams(tabId, myStackId, {
                toolCallIds: remaining,
              });
            }
            toolCallIdToStackId.set(toolKey, existingStackId);
          } else if (!existingStackId && myStackId) {
            // 逻辑：首次看到此路径 → 记录并更新标题。
            writeFileStackByPath.set(firstPath, myStackId);
            const rt = useTabRuntime.getState().runtimeByTabId[tabId];
            const item = rt?.stack?.find((s: any) => s.id === myStackId);
            if (item && item.title !== fileName) {
              const tabView2 = tabId ? getTabViewById(tabId) : undefined;
              const wId = tabView2?.workspaceId ?? "";
              const bp2 = useTabRuntime.getState().runtimeByTabId[tabId]?.base?.params as Record<string, unknown> | undefined;
              const pId = typeof bp2?.projectId === "string" ? bp2.projectId : undefined;
              useTabRuntime.getState().pushStackItem(tabId, {
                id: myStackId,
                sourceKey: myStackId,
                component: "streaming-code-viewer",
                title: fileName,
                params: { ...(item.params ?? {}), toolCallIds: (item.params?.toolCallIds as string[]) ?? [toolKey], workspaceId: wId, projectId: pId, __isStreaming: true },
              });
            }
          }
        }
      }
      // 逻辑：write-file 完成时，检查该 stack 的所有 toolCallIds 是否全部完成。
      if (
        isWriteFile &&
        processedWriteFileTools.has(toolKey) &&
        (state === "input-available" || state === "output-available" || state === "output-error")
      ) {
        const myStackId = toolCallIdToStackId.get(toolKey);
        if (myStackId) {
          const rt = useTabRuntime.getState().runtimeByTabId[tabId];
          const item = rt?.stack?.find((s: any) => s.id === myStackId);
          const allIds = (item?.params?.toolCallIds as string[]) ?? [];
          const allDone = allIds.every((id: string) => {
            const tp = useChatRuntime.getState().toolPartsByTabId[tabId]?.[id];
            const st = typeof tp?.state === "string" ? tp.state : "";
            return st === "input-available" || st === "output-available" || st === "output-error";
          });
          if (allDone) {
            useTabRuntime.getState().setStackItemParams(tabId, myStackId, {
              __isStreaming: false,
            });
          }
        }
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
