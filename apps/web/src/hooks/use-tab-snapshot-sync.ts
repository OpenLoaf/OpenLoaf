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
import { useAppView } from "./use-app-view";
import { useLayoutState } from "./use-layout-state";
import { getAppState } from "./use-app-state";
import { upsertTabSnapshotNow } from "@/lib/tab-snapshot";

/**
 * SSE 期间同步 Tab 快照（MVP）：
 * - 首次立即上报一次，后续仅在视图发生变化时上报
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

    const sendNow = () => {
      void upsertTabSnapshotNow({ sessionId: input.sessionId, tabId });
    };

    sendNow();

    const scheduleSendIfChanged = () => {
      const snapshot = getAppState();
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

    const unsubscribeView = useAppView.subscribe(scheduleSendIfChanged);
    const unsubscribeLayout = useLayoutState.subscribe(scheduleSendIfChanged);

    return () => {
      unsubscribeView();
      unsubscribeLayout();
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [input.enabled, input.sessionId, input.tabId]);
}
