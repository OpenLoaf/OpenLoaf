"use client";

import * as React from "react";
import { useTabs } from "./use-tabs";
import { upsertTabSnapshotNow } from "@/lib/tab-snapshot";

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
  const debounceTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!input.enabled) return;
    if (!input.sessionId) return;
    if (!input.tabId) return;

    const tabId = input.tabId;

    // 中文注释：发送一次“当前状态”，确保 server 缓存立刻可用。
    const sendNow = () => {
      void upsertTabSnapshotNow({ sessionId: input.sessionId, tabId });
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
  }, [input.enabled, input.sessionId, input.tabId]);
}
