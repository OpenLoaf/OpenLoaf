/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type React from "react";
import type { UIMessageChunk } from "ai";
import type { ToolPartSnapshot } from "@/hooks/use-chat-runtime";
import type { SubAgentStreamState } from "../context/ChatToolContext";

type SubAgentDataPayload = {
  toolCallId?: string;
  masterToolUseId?: string;
  name?: string;
  task?: string;
  delta?: string;
  output?: string;
  errorText?: string;
  chunk?: UIMessageChunk;
};

// masterToolUseId (AI SDK tool call id) → sub-agent toolCallId 映射
const masterToolUseIdToAgentId = new Map<string, string>()

export function getAgentIdByMasterToolUseId(masterToolUseId: string): string | undefined {
  return masterToolUseIdToAgentId.get(masterToolUseId)
}

export function clearMasterToolUseIdMap(): void {
  masterToolUseIdToAgentId.clear()
}

export function handleSubAgentDataPart(input: {
  dataPart: any;
  setSubAgentStreams?: React.Dispatch<React.SetStateAction<Record<string, SubAgentStreamState>>>;
  enqueueSubAgentChunk?: (toolCallId: string, chunk: UIMessageChunk) => void;
  closeSubAgentStream?: (
    toolCallId: string,
    state: "output-available" | "output-error",
  ) => void;
  tabId?: string;
  upsertToolPart?: (tabId: string, toolCallId: string, next: ToolPartSnapshot) => void;
}) {
  const type = input.dataPart?.type;
  if (
    type !== "data-sub-agent-start" &&
    type !== "data-sub-agent-delta" &&
    type !== "data-sub-agent-end" &&
    type !== "data-sub-agent-error" &&
    type !== "data-sub-agent-chunk"
  ) {
    return false;
  }

  const payload = input.dataPart?.data as SubAgentDataPayload | undefined;
  const toolCallId = typeof payload?.toolCallId === "string" ? payload?.toolCallId : "";
  if (!toolCallId) return true;

  if (type === "data-sub-agent-chunk") {
    const chunk = payload?.chunk;
    if (!chunk) return true;
    input.enqueueSubAgentChunk?.(toolCallId, chunk);
    return true;
  }

  const setSubAgentStreams = input.setSubAgentStreams;
  if (!setSubAgentStreams) return true;
  if (type === "data-sub-agent-end") {
    input.closeSubAgentStream?.(toolCallId, "output-available");
  }
  if (type === "data-sub-agent-error") {
    input.closeSubAgentStream?.(toolCallId, "output-error");
  }

  setSubAgentStreams((prev) => {
    const current: SubAgentStreamState = prev[toolCallId] ?? {
      toolCallId,
      output: "",
      state: "output-streaming",
    };

    if (type === "data-sub-agent-start") {
      const name = typeof payload?.name === "string" ? payload?.name : "";
      const task = typeof payload?.task === "string" ? payload?.task : "";
      const masterToolUseId =
        typeof payload?.masterToolUseId === "string" ? payload.masterToolUseId : undefined;
      if (masterToolUseId) {
        masterToolUseIdToAgentId.set(masterToolUseId, toolCallId);
      }
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          name: name || current.name,
          task: task || current.task,
          masterToolUseId: masterToolUseId || current.masterToolUseId,
          state: "output-streaming",
          streaming: true,
          startedAt: current.startedAt ?? Date.now(),
        },
      };
    }

    if (type === "data-sub-agent-delta") {
      const delta = typeof payload?.delta === "string" ? payload?.delta : "";
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          output: `${current.output}${delta}`,
          state: "output-streaming",
          streaming: true,
        },
      };
    }

    if (type === "data-sub-agent-end") {
      const output = typeof payload?.output === "string" ? payload?.output : "";
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          output: output || current.output,
          state: "output-available",
          streaming: false,
        },
      };
    }

    if (type === "data-sub-agent-error") {
      const errorText = typeof payload?.errorText === "string" ? payload?.errorText : "";
      return {
        ...prev,
        [toolCallId]: {
          ...current,
          errorText: errorText || current.errorText,
          state: "output-error",
          streaming: false,
        },
      };
    }

    return prev;
  });

  return true;
}

export function handleStepThinkingDataPart(input: {
  dataPart: any;
  setStepThinking?: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const type = input.dataPart?.type;
  if (type !== "data-step-thinking") return false;
  const setStepThinking = input.setStepThinking;
  if (!setStepThinking) return true;

  const active = Boolean(input.dataPart?.data?.active);
  setStepThinking(active);
  return true;
}

/** Handle canonical branch snapshot data parts from SSE stream. */
export function handleBranchSnapshotDataPart(input: {
  dataPart: any;
  sessionId: string;
  commitServerSnapshot?: (snapshot: any) => void;
  markReceived?: () => void;
}) {
  if (input.dataPart?.type !== "data-branch-snapshot") return false;
  const payload =
    input.dataPart?.data && typeof input.dataPart.data === "object"
      ? input.dataPart.data
      : null;
  const sessionIdInData =
    typeof payload?.sessionId === "string" ? String(payload.sessionId) : "";
  if (sessionIdInData && sessionIdInData !== input.sessionId) return true;

  const snapshot =
    payload?.snapshot && typeof payload.snapshot === "object"
      ? payload.snapshot
      : payload;
  if (!snapshot || typeof snapshot !== "object") return true;
  if (!input.commitServerSnapshot) return true;

  input.markReceived?.();
  input.commitServerSnapshot(snapshot);
  return true;
}

/**
 * Handle `data-temp-project` data part.
 *
 * When the backend creates a temporary project during a global chat
 * (via `ensureTempProject()`), it emits this event so the frontend
 * can update its params / context to the newly created project.
 *
 * Returns `true` if the data part was consumed.
 */
export function handleTempProjectDataPart(input: {
  dataPart: any;
  onTempProject?: (data: { projectId: string; projectRoot: string; isTemp: boolean }) => void;
}): boolean {
  if (input.dataPart?.type !== "data-temp-project") return false;
  const data = input.dataPart?.data;
  if (!data || typeof data !== "object") return true;

  const projectId = typeof data.projectId === "string" ? data.projectId : "";
  const projectRoot = typeof data.projectRoot === "string" ? data.projectRoot : "";
  if (!projectId) return true;

  input.onTempProject?.({ projectId, projectRoot, isTemp: Boolean(data.isTemp) });
  return true;
}

/** Handle media generate data parts from SSE stream. */
export function handleMediaGenerateDataPart(input: {
  dataPart: any;
  upsertToolPartMerged?: (key: string, next: Record<string, unknown>) => void;
}) {
  const type = input.dataPart?.type;
  if (
    type !== "data-media-generate-start" &&
    type !== "data-media-generate-progress" &&
    type !== "data-media-generate-end" &&
    type !== "data-media-generate-error"
  ) {
    return false;
  }
  const data = input.dataPart?.data as Record<string, unknown> | undefined;
  const toolCallId = typeof data?.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId || !input.upsertToolPartMerged) return true;

  if (type === "data-media-generate-start") {
    input.upsertToolPartMerged(toolCallId, {
      mediaGenerate: {
        status: "generating",
        kind: data?.kind,
        prompt: data?.prompt,
      },
    });
  } else if (type === "data-media-generate-progress") {
    input.upsertToolPartMerged(toolCallId, {
      mediaGenerate: {
        status: "generating",
        kind: data?.kind,
        progress: data?.progress,
      },
    });
  } else if (type === "data-media-generate-end") {
    input.upsertToolPartMerged(toolCallId, {
      mediaGenerate: {
        status: "done",
        kind: data?.kind,
        urls: data?.urls,
      },
    });
  } else if (type === "data-media-generate-error") {
    input.upsertToolPartMerged(toolCallId, {
      mediaGenerate: {
        status: "error",
        kind: data?.kind,
        errorCode: data?.errorCode,
      },
    });
  }
  return true;
}
