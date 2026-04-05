/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { UIMessageChunk } from "ai";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useRuntimeTasks } from "@/hooks/use-runtime-tasks";
import type { RuntimeTask } from "@openloaf/api/types/tools/runtimeTask";

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

// masterToolUseId (AI SDK tool call id) → SubAgent toolCallId 映射
const masterToolUseIdToAgentId = new Map<string, string>()

export function getAgentIdByMasterToolUseId(masterToolUseId: string): string | undefined {
  return masterToolUseIdToAgentId.get(masterToolUseId)
}

export function clearMasterToolUseIdMap(): void {
  masterToolUseIdToAgentId.clear()
}

export function handleSubAgentDataPart(input: {
  dataPart: any;
  tabId?: string;
  enqueueSubAgentChunk?: (toolCallId: string, chunk: UIMessageChunk) => void;
  closeSubAgentStream?: (
    toolCallId: string,
    state: "output-available" | "output-error",
  ) => void;
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

  const tabId = input.tabId;
  if (!tabId) return true;

  const { updateSubAgentStream } = useChatRuntime.getState();

  if (type === "data-sub-agent-end") {
    input.closeSubAgentStream?.(toolCallId, "output-available");
  }
  if (type === "data-sub-agent-error") {
    input.closeSubAgentStream?.(toolCallId, "output-error");
  }

  if (type === "data-sub-agent-start") {
    const name = typeof payload?.name === "string" ? payload?.name : "";
    const task = typeof payload?.task === "string" ? payload?.task : "";
    const masterToolUseId =
      typeof payload?.masterToolUseId === "string" ? payload.masterToolUseId : undefined;
    if (masterToolUseId) {
      masterToolUseIdToAgentId.set(masterToolUseId, toolCallId);
    }
    updateSubAgentStream(tabId, toolCallId, {
      name: name || undefined,
      task: task || undefined,
      masterToolUseId: masterToolUseId || undefined,
      state: "output-streaming",
      streaming: true,
      startedAt: Date.now(),
    });
  } else if (type === "data-sub-agent-delta") {
    const delta = typeof payload?.delta === "string" ? payload?.delta : "";
    // delta 需要读旧值拼接，使用 Zustand set 的函数式更新
    useChatRuntime.setState((state) => {
      const tabStreams = state.subAgentStreamsByTabId[tabId] ?? {};
      const current = tabStreams[toolCallId] ?? {
        toolCallId,
        output: "",
        state: "output-streaming" as const,
      };
      return {
        subAgentStreamsByTabId: {
          ...state.subAgentStreamsByTabId,
          [tabId]: {
            ...tabStreams,
            [toolCallId]: {
              ...current,
              output: `${current.output}${delta}`,
              state: "output-streaming",
              streaming: true,
            },
          },
        },
      };
    });
  } else if (type === "data-sub-agent-end") {
    const output = typeof payload?.output === "string" ? payload?.output : "";
    updateSubAgentStream(tabId, toolCallId, {
      output: output || undefined,
      state: "output-available",
      streaming: false,
    });
  } else if (type === "data-sub-agent-error") {
    const errorText = typeof payload?.errorText === "string" ? payload?.errorText : "";
    updateSubAgentStream(tabId, toolCallId, {
      errorText: errorText || undefined,
      state: "output-error",
      streaming: false,
    });
  }

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

/** Handle plan file data parts from SSE stream — auto-opens plan in stack. */
export function handlePlanFileDataPart(input: {
  dataPart: any;
  sessionId: string;
  onPlanFile?: (data: { planNo: number; filePath: string; actionName: string; status: string }) => void;
}) {
  if (input.dataPart?.type !== "data-plan-file") return false;
  const data = input.dataPart?.data;
  if (!data || typeof data !== "object") return true;
  const planNo = typeof data.planNo === "number" ? data.planNo : 0;
  const filePath = typeof data.filePath === "string" ? data.filePath : "";
  const actionName = typeof data.actionName === "string" ? data.actionName : "计划";
  const status = typeof data.status === "string" ? data.status : "active";
  if (planNo > 0 && filePath && input.onPlanFile) {
    input.onPlanFile({ planNo, filePath, actionName, status });
  }
  return true;
}

/** Validate that an incoming task payload has the minimum required shape. */
function isValidTaskPayload(v: unknown): v is RuntimeTask {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    t.id.length > 0 &&
    typeof t.subject === "string" &&
    typeof t.status === "string" &&
    Array.isArray(t.blocks) &&
    Array.isArray(t.blockedBy)
  );
}

/** Handle runtime task data parts from SSE stream — updates runtime tasks store. */
export function handleRuntimeTaskDataPart(input: {
  dataPart: any;
  sessionId: string;
}) {
  if (input.dataPart?.type !== "data-runtime-task") return false;
  const data = input.dataPart?.data;
  if (!data || typeof data !== "object") return true;
  const seq = typeof data.seq === "number" ? data.seq : 0;
  const event = typeof data.event === "string" ? data.event : "";
  const store = useRuntimeTasks.getState();
  if (event === "created" && isValidTaskPayload(data.task)) {
    store.applyEvent(input.sessionId, { seq, kind: "created", task: data.task });
  } else if (event === "updated" && isValidTaskPayload(data.task)) {
    store.applyEvent(input.sessionId, { seq, kind: "updated", task: data.task });
  } else if (event === "deleted" && typeof data.taskId === "string") {
    store.applyEvent(input.sessionId, { seq, kind: "deleted", taskId: data.taskId });
  } else if (event === "snapshot" && data.snapshot && Array.isArray(data.snapshot.tasks)) {
    const validTasks = (data.snapshot.tasks as unknown[]).filter(isValidTaskPayload);
    store.applyEvent(input.sessionId, { seq, kind: "snapshot", tasks: validTasks });
  }
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
