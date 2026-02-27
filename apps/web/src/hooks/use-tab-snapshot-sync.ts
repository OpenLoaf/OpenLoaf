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

import * as React from "react";
import { useTabs } from "./use-tabs";
import { useTabRuntime } from "./use-tab-runtime";
import { getTabViewById } from "./use-tab-view";
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
  const lastJsonRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!input.enabled) return;
    if (!input.sessionId) return;
    if (!input.tabId) return;

    const tabId = input.tabId;
    lastJsonRef.current = "";

    // 发送一次“当前状态”，确保 server 缓存立刻可用。
    const sendNow = () => {
      void upsertTabSnapshotNow({ sessionId: input.sessionId, tabId });
    };

    sendNow();

    const scheduleSendIfChanged = () => {
      const snapshot = getTabViewById(tabId);
      if (!snapshot) return;
      let json = "";
      try {
        json = JSON.stringify(snapshot);
      } catch {
        return;
      }
      if (json === lastJsonRef.current) return;
      lastJsonRef.current = json;

      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        sendNow();
      }, 200);
    };

    // 订阅 meta 与 runtime 的变化，避免无关 store 触发同步。
    const unsubscribeTabs = useTabs.subscribe(scheduleSendIfChanged);
    const unsubscribeRuntime = useTabRuntime.subscribe(scheduleSendIfChanged);

    return () => {
      unsubscribeTabs();
      unsubscribeRuntime();
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [input.enabled, input.sessionId, input.tabId]);
}
