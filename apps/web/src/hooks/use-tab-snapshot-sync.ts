"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useTabs } from "./use-tabs";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { trpc } from "@/utils/trpc";

/**
 * SSE 期间同步 Tab 快照（MVP）：
 * - 只同步本次聊天请求绑定的 tabId
 * - 首次立即上报一次，后续仅在该 Tab 发生变化时上报
 */
export function useTabSnapshotSync(input: {
  enabled: boolean;
  sessionId: string;
  tabId: string | null | undefined;
}) {
  const mutation = useMutation(trpc.tab.upsertSnapshot.mutationOptions());
  const seqRef = React.useRef(0);
  const lastJsonRef = React.useRef<string>("");
  const debounceTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!input.enabled) return;
    if (!input.sessionId) return;
    if (!input.tabId) return;

    const clientId = getWebClientId();
    const tabId = input.tabId;

    // 中文注释：发送一次“当前状态”，确保 server 缓存立刻可用。
    const sendNow = () => {
      const tab = useTabs.getState().getTabById(tabId);
      if (!tab) return;
      let json = "";
      try {
        json = JSON.stringify(tab);
      } catch {
        return;
      }
      if (json === lastJsonRef.current) return;
      lastJsonRef.current = json;
      seqRef.current += 1;
      mutation.mutate({
        sessionId: input.sessionId,
        clientId,
        tabId,
        seq: seqRef.current,
        tab,
      });
    };

    sendNow();

    // 中文注释：MVP 不引入 subscribeWithSelector；订阅全量变化，但用 JSON 对比避免重复上报。
    const unsubscribe = useTabs.subscribe(() => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        sendNow();
      }, 200);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [input.enabled, input.sessionId, input.tabId, mutation]);
}
