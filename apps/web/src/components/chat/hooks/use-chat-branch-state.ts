"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import type { ChatSiblingNav } from "../context/ChatSessionContext";

export function useChatBranchState(sessionId: string) {
  const [leafMessageId, setLeafMessageId] = React.useState<string | null>(null);
  const [branchMessageIds, setBranchMessageIds] = React.useState<string[]>([]);
  const [siblingNav, setSiblingNav] = React.useState<Record<string, ChatSiblingNav>>({});
  const queryClient = useQueryClient();

  const refreshBranchMeta = React.useCallback(
    async (startMessageId: string) => {
      const data = await queryClient.fetchQuery(
        trpc.chat.getChatView.queryOptions({
          sessionId,
          anchor: { messageId: startMessageId, strategy: "self" },
          window: { limit: 50 },
          include: { messages: false, siblingNav: true },
          includeToolOutput: false,
        })
      );
      setLeafMessageId(data.leafMessageId ?? null);
      setBranchMessageIds(data.branchMessageIds ?? []);
      setSiblingNav((data.siblingNav ?? {}) as Record<string, ChatSiblingNav>);
    },
    [queryClient, sessionId]
  );

  return {
    leafMessageId,
    setLeafMessageId,
    branchMessageIds,
    setBranchMessageIds,
    siblingNav,
    setSiblingNav,
    refreshBranchMeta,
  };
}
