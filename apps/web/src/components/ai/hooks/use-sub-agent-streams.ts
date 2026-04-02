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

import React from "react";
import { readUIMessageStream, type UIMessageChunk } from "ai";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { handleSubAgentToolParts } from "@/lib/chat/sub-agent-tool-parts";
import { clearMasterToolUseIdMap } from "../utils/chat-data-handlers";
import type { useChatToolStream } from "./use-chat-tool-stream";

type UseSubAgentStreamsOptions = {
  tabIdRef: React.RefObject<string | null | undefined>;
  toolStream: ReturnType<typeof useChatToolStream>;
};

export function useSubAgentStreams({ tabIdRef, toolStream }: UseSubAgentStreamsOptions) {
  const subAgentStreamControllersRef = React.useRef(
    new Map<string, ReadableStreamDefaultController<UIMessageChunk>>(),
  );
  const upsertToolPart = useChatRuntime((s) => s.upsertToolPart);

  const ensureSubAgentStreamController = React.useCallback(
    (toolCallId: string) => {
      const existing = subAgentStreamControllersRef.current.get(toolCallId);
      if (existing) return existing;

      let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
      const stream = new ReadableStream<UIMessageChunk>({
        start(controllerParam) {
          controller = controllerParam;
        },
      });
      if (!controller) return null;
      subAgentStreamControllersRef.current.set(toolCallId, controller);

      const messageStream = readUIMessageStream({
        stream,
      });

      (async () => {
        try {
          for await (const message of messageStream as AsyncIterable<{
            parts?: unknown[];
          }>) {
            if (!subAgentStreamControllersRef.current.has(toolCallId)) break;

            const tabId = tabIdRef.current ?? undefined;
            if (!tabId) continue;

            // 合并 parts + toolUseCount 为单次 Zustand 写入
            const toolNames: string[] = [];
            if (Array.isArray(message.parts)) {
              for (const p of message.parts) {
                const candidate = p as { type?: string; toolName?: string } | null;
                const type = candidate?.type ?? "";
                const toolName = candidate?.toolName;
                if (
                  toolName != null ||
                  type === "dynamic-tool" ||
                  (type && type.startsWith("tool-"))
                ) {
                  toolNames.push(toolName ?? type);
                }
              }
            }

            // 单次 Zustand 写入（合并 parts、state、toolUseCount、recentTools）
            useChatRuntime.setState((state) => {
              const tabStreams = state.subAgentStreamsByTabId[tabId] ?? {};
              const current = tabStreams[toolCallId] ?? {
                toolCallId,
                output: "",
                state: "output-streaming" as const,
              };
              const prevCount = current.toolUseCount ?? 0;
              const prevRecent = current.recentTools ?? [];
              // toolNames 来自完整消息快照（structuredClone），不是增量，不能累加
              // 有 tool parts 时直接以快照总数替换；无 tool parts 时保持原值不变
              const nextCount = toolNames.length > 0 ? toolNames.length : prevCount;
              // recentTools 同理：直接替换为当前快照中最新的 tool 列表
              const nextRecent = toolNames.length > 0 ? toolNames : prevRecent;
              return {
                subAgentStreamsByTabId: {
                  ...state.subAgentStreamsByTabId,
                  [tabId]: {
                    ...tabStreams,
                    [toolCallId]: {
                      ...current,
                      parts: Array.isArray(message.parts) ? message.parts : current.parts,
                      state: "output-streaming",
                      streaming: true,
                      toolUseCount: nextCount,
                      recentTools: nextRecent.slice(-5),
                    },
                  },
                },
              };
            });

            if (tabId && Array.isArray(message.parts)) {
              handleSubAgentToolParts({
                parts: message.parts,
                tabId,
                subAgentToolCallId: toolCallId,
                upsertToolPart,
                executeToolPart: toolStream.executeFromToolPart,
              });
            }
          }
        } finally {
          subAgentStreamControllersRef.current.delete(toolCallId);
          const tabId = tabIdRef.current ?? undefined;
          if (tabId) {
            useChatRuntime.getState().updateSubAgentStream(tabId, toolCallId, {
              streaming: false,
            });
          }
        }
      })();

      return controller;
    },
    [toolStream, upsertToolPart, tabIdRef],
  );

  const enqueueSubAgentChunk = React.useCallback(
    (toolCallId: string, chunk: UIMessageChunk) => {
      const controller = ensureSubAgentStreamController(toolCallId);
      if (!controller) return;
      try {
        controller.enqueue(chunk);
      } catch {
        subAgentStreamControllersRef.current.delete(toolCallId);
        return;
      }
      const type = (chunk as any)?.type;
      if (type === "finish" || type === "error" || type === "abort") {
        controller.close();
        subAgentStreamControllersRef.current.delete(toolCallId);
        const tabId = tabIdRef.current ?? undefined;
        if (tabId) {
          useChatRuntime.getState().updateSubAgentStream(tabId, toolCallId, {
            streaming: false,
            state: type === "error" || type === "abort" ? "output-error" : "output-available",
          });
        }
      }
    },
    [ensureSubAgentStreamController, tabIdRef],
  );

  const closeSubAgentStream = React.useCallback(
    (toolCallId: string, state: "output-available" | "output-error") => {
      const controller = subAgentStreamControllersRef.current.get(toolCallId);
      if (controller) {
        controller.close();
        subAgentStreamControllersRef.current.delete(toolCallId);
      }
      const tabId = tabIdRef.current ?? undefined;
      if (tabId) {
        useChatRuntime.getState().updateSubAgentStream(tabId, toolCallId, {
          streaming: false,
          state,
        });
      }
    },
    [tabIdRef],
  );

  /** Reset all SubAgent streams (e.g. on session change). */
  const resetSubAgentStreams = React.useCallback(() => {
    const tabId = tabIdRef.current ?? undefined;
    if (tabId) {
      useChatRuntime.getState().clearSubAgentStreams(tabId);
    }
    subAgentStreamControllersRef.current.forEach((controller) => {
      controller.close();
    });
    subAgentStreamControllersRef.current.clear();
    clearMasterToolUseIdMap();
  }, [tabIdRef]);

  /**
   * Abort all active SubAgent streams without clearing history.
   * Called when user clicks Stop — marks streaming entries as completed
   * so cards don't remain stuck in "running" state.
   */
  const abortSubAgentStreams = React.useCallback(() => {
    // Close all active ReadableStream controllers first.
    subAgentStreamControllersRef.current.forEach((controller) => {
      try { controller.close(); } catch { /* already closed */ }
    });
    subAgentStreamControllersRef.current.clear();

    // Mark every streaming entry as completed (preserve output/parts).
    const tabId = tabIdRef.current ?? undefined;
    if (!tabId) return;
    useChatRuntime.setState((state) => {
      const tabStreams = state.subAgentStreamsByTabId[tabId];
      if (!tabStreams) return state;
      let changed = false;
      const nextTabStreams = { ...tabStreams };
      for (const [toolCallId, entry] of Object.entries(tabStreams)) {
        if (entry.streaming) {
          nextTabStreams[toolCallId] = {
            ...entry,
            streaming: false,
            state: "output-available",
          };
          changed = true;
        }
      }
      if (!changed) return state;
      return {
        subAgentStreamsByTabId: {
          ...state.subAgentStreamsByTabId,
          [tabId]: nextTabStreams,
        },
      };
    });
  }, [tabIdRef]);

  return {
    enqueueSubAgentChunk,
    closeSubAgentStream,
    resetSubAgentStreams,
    abortSubAgentStreams,
  };
}
