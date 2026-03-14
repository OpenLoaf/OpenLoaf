"use client";

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import type { ChatSiblingNav } from "../context/ChatSessionContext";

type ChatViewInput = {
  anchor?: { messageId: string; strategy?: "self" | "latestLeafInSubtree" };
  window?: { limit?: number; cursor?: { beforeMessageId: string } };
  include?: { messages?: boolean; siblingNav?: boolean };
  includeToolOutput?: boolean;
};

export type ChatBranchSnapshot = {
  /** Current branch messages returned by the server snapshot. */
  messages: UIMessage[];
  /** Active leaf message id of the current branch. */
  leafMessageId: string | null;
  /** Message ids on the current branch. */
  branchMessageIds: string[];
  /** Sibling navigation metadata keyed by message id. */
  siblingNav: Record<string, ChatSiblingNav>;
  /** Session-level error restored from persisted metadata. */
  errorMessage: string | null;
};

type ApplySnapshotOptions = {
  /** Preserve the previous message list when the incoming payload omits messages. */
  preserveMessagesWhenMissing?: boolean;
};

type UseChatBranchQueryInput = {
  /** Current chat session id. */
  sessionId: string;
  /** Whether the initial history request should be active. */
  enabled: boolean;
  /** Number of messages already present in local chat state. */
  localMessageCount: number;
  /** Branch snapshot state from useBranchSnapshot(). */
  branchSnapshot: ReturnType<typeof useBranchSnapshot>;
};

const EMPTY_BRANCH_SNAPSHOT: ChatBranchSnapshot = {
  messages: [],
  leafMessageId: null,
  branchMessageIds: [],
  siblingNav: {},
  errorMessage: null,
};

/** Normalize raw getChatView data into the local branch snapshot model. */
function buildSnapshot(
  data: unknown,
  previous: ChatBranchSnapshot,
  options?: ApplySnapshotOptions,
): ChatBranchSnapshot {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rawMessages = record.messages;
  const nextMessages = Array.isArray(rawMessages)
    ? (rawMessages as UIMessage[])
    : options?.preserveMessagesWhenMissing
      ? previous.messages
      : [];

  return {
    messages: nextMessages,
    leafMessageId:
      typeof record.leafMessageId === "string" ? record.leafMessageId : null,
    branchMessageIds: Array.isArray(record.branchMessageIds)
      ? (record.branchMessageIds as string[])
      : [],
    siblingNav:
      record.siblingNav && typeof record.siblingNav === "object"
        ? (record.siblingNav as Record<string, ChatSiblingNav>)
        : {},
    errorMessage:
      typeof record.errorMessage === "string" ? record.errorMessage : null,
  };
}

/**
 * Snapshot state + mutation functions — no dependency on chat messages.
 * Call this BEFORE useChat so patchSnapshot / refreshBranchMeta are available to onFinish.
 */
export function useBranchSnapshot(sessionId: string) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = React.useState<ChatBranchSnapshot>(
    EMPTY_BRANCH_SNAPSHOT,
  );
  const snapshotRef = React.useRef<ChatBranchSnapshot>(EMPTY_BRANCH_SNAPSHOT);

  const applySnapshot = React.useCallback(
    (data: unknown, options?: ApplySnapshotOptions) => {
      const nextSnapshot = buildSnapshot(data, snapshotRef.current, options);
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    [],
  );

  const patchSnapshot = React.useCallback(
    (
      patch:
        | Partial<ChatBranchSnapshot>
        | ((prev: ChatBranchSnapshot) => Partial<ChatBranchSnapshot>),
    ) => {
      const previous = snapshotRef.current;
      const nextPatch = typeof patch === "function" ? patch(previous) : patch;
      const nextSnapshot = { ...previous, ...nextPatch };
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    },
    [],
  );

  const resetSnapshot = React.useCallback(() => {
    snapshotRef.current = EMPTY_BRANCH_SNAPSHOT;
    setSnapshot(EMPTY_BRANCH_SNAPSHOT);
  }, []);

  const clearCachedView = React.useCallback(() => {
    queryClient.removeQueries({
      queryKey: trpc.chat.getChatView.queryKey(),
    });
  }, [queryClient]);

  const refreshSnapshot = React.useCallback(
    async (nextInput?: ChatViewInput, options?: ApplySnapshotOptions) => {
      const data = await queryClient.fetchQuery(
        trpc.chat.getChatView.queryOptions({
          sessionId,
          window: { limit: 50 },
          includeToolOutput: true,
          ...(nextInput ?? {}),
        }),
      );
      return applySnapshot(data, options);
    },
    [applySnapshot, sessionId, queryClient],
  );

  const refreshBranchMeta = React.useCallback(
    async (startMessageId: string) => {
      const data = await queryClient.fetchQuery(
        trpc.chat.getChatView.queryOptions({
          sessionId,
          anchor: { messageId: startMessageId, strategy: "self" },
          window: { limit: 50 },
          include: { messages: false, siblingNav: true },
          includeToolOutput: false,
        }),
      );
      patchSnapshot(() => ({
        leafMessageId:
          typeof data.leafMessageId === "string" ? data.leafMessageId : null,
        branchMessageIds: Array.isArray(data.branchMessageIds)
          ? (data.branchMessageIds as string[])
          : [],
        siblingNav:
          data.siblingNav && typeof data.siblingNav === "object"
            ? (data.siblingNav as Record<string, ChatSiblingNav>)
            : {},
      }));
      return data;
    },
    [sessionId, patchSnapshot, queryClient],
  );

  return {
    snapshot,
    applySnapshot,
    patchSnapshot,
    resetSnapshot,
    clearCachedView,
    refreshSnapshot,
    refreshBranchMeta,
  };
}

/** Query layer — depends on chat.messages.length via localMessageCount. */
export function useChatBranchState(input: UseChatBranchQueryInput) {
  const { snapshot, applySnapshot, patchSnapshot, resetSnapshot, clearCachedView, refreshSnapshot, refreshBranchMeta } =
    input.branchSnapshot;

  const query = useQuery({
    ...trpc.chat.getChatView.queryOptions({
      sessionId: input.sessionId,
      window: { limit: 50 },
      includeToolOutput: true,
    }),
    enabled: input.enabled,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const pendingHistoryMessages = React.useMemo(() => {
    const data = query.data;
    if (!data) return [];
    const nextSnapshot = buildSnapshot(data, EMPTY_BRANCH_SNAPSHOT);
    return nextSnapshot.messages;
  }, [query.data]);

  const isHistoryLoading =
    input.enabled &&
    (query.isLoading ||
      query.isFetching ||
      (pendingHistoryMessages.length > 0 && input.localMessageCount === 0));

  return {
    snapshot,
    leafMessageId: snapshot.leafMessageId,
    branchMessageIds: snapshot.branchMessageIds,
    siblingNav: snapshot.siblingNav,
    errorMessage: snapshot.errorMessage,
    branchQueryData: query.data,
    isHistoryLoading,
    applySnapshot,
    patchSnapshot,
    resetSnapshot,
    clearCachedView,
    refreshSnapshot,
    refreshBranchMeta,
  };
}
