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
import { useChatRuntime, type ToolPartSnapshot } from "@/hooks/use-chat-runtime";
import { handleSubAgentToolParts } from "@/lib/chat/sub-agent-tool-parts";
import { clearMasterToolUseIdMap } from "../utils/chat-data-handlers";
import type { SubAgentStreamState } from "../context/ChatToolContext";
import type { useChatToolStream } from "./use-chat-tool-stream";

type UseSubAgentStreamsOptions = {
  tabIdRef: React.MutableRefObject<string | null | undefined>;
  toolStream: ReturnType<typeof useChatToolStream>;
};

export function useSubAgentStreams({ tabIdRef, toolStream }: UseSubAgentStreamsOptions) {
  const [subAgentStreams, setSubAgentStreams] = React.useState<
    Record<string, SubAgentStreamState>
  >({});
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
            setSubAgentStreams((prev) => {
              const current = prev[toolCallId] ?? {
                toolCallId,
                output: "",
                state: "output-streaming",
              };
              return {
                ...prev,
                [toolCallId]: {
                  ...current,
                  parts: Array.isArray(message.parts) ? message.parts : current.parts,
                  state: "output-streaming",
                  streaming: true,
                },
              };
            });

            // 累计 toolUseCount 和 recentTools
            if (Array.isArray(message.parts)) {
              const toolNames: string[] = [];
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
              if (toolNames.length > 0) {
                setSubAgentStreams((prev) => {
                  const current = prev[toolCallId];
                  if (!current) return prev;
                  const prevCount = current.toolUseCount ?? 0;
                  const prevRecent = current.recentTools ?? [];
                  const merged = [...prevRecent, ...toolNames];
                  return {
                    ...prev,
                    [toolCallId]: {
                      ...current,
                      toolUseCount: prevCount + toolNames.length,
                      recentTools: merged.slice(-5),
                    },
                  };
                });
              }
            }

            const tabId = tabIdRef.current ?? undefined;
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
          setSubAgentStreams((prev) => {
            const current = prev[toolCallId];
            if (!current) return prev;
            return {
              ...prev,
              [toolCallId]: {
                ...current,
                streaming: false,
              },
            };
          });
        }
      })();

      return controller;
    },
    [setSubAgentStreams, toolStream, upsertToolPart, tabIdRef],
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
        setSubAgentStreams((prev) => {
          const current = prev[toolCallId];
          if (!current) return prev;
          return {
            ...prev,
            [toolCallId]: {
              ...current,
              streaming: false,
              state: type === "error" || type === "abort" ? "output-error" : "output-available",
            },
          };
        });
      }
    },
    [ensureSubAgentStreamController, setSubAgentStreams],
  );

  const closeSubAgentStream = React.useCallback(
    (toolCallId: string, state: "output-available" | "output-error") => {
      const controller = subAgentStreamControllersRef.current.get(toolCallId);
      if (controller) {
        controller.close();
        subAgentStreamControllersRef.current.delete(toolCallId);
      }
      setSubAgentStreams((prev) => {
        const current = prev[toolCallId];
        if (!current) return prev;
        return {
          ...prev,
          [toolCallId]: {
            ...current,
            streaming: false,
            state,
          },
        };
      });
    },
    [setSubAgentStreams],
  );

  /** Reset all sub-agent streams (e.g. on session change). */
  const resetSubAgentStreams = React.useCallback(() => {
    setSubAgentStreams({});
    subAgentStreamControllersRef.current.forEach((controller) => {
      controller.close();
    });
    subAgentStreamControllersRef.current.clear();
    clearMasterToolUseIdMap();
  }, []);

  return {
    subAgentStreams,
    setSubAgentStreams,
    enqueueSubAgentChunk,
    closeSubAgentStream,
    resetSubAgentStreams,
  };
}
