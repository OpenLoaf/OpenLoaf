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

import { useEffect, useRef, useState } from "react";

/**
 * SSE stream health monitor — detects stalled streams and provides
 * timeout feedback to the user.
 *
 * When the chat status is "streaming" but no messages arrive for
 * STALL_TIMEOUT_MS, sets `isStalled` to true so the UI can show
 * a reconnection prompt.
 */

const STALL_TIMEOUT_MS = 30_000;

export function useStreamHealthMonitor(input: {
  /** Current chat status from useChat. */
  status: string;
  /** Current message count — used to detect activity. */
  messageCount: number;
  /** Call to stop the current stream. */
  stop: () => void;
}) {
  const { status, messageCount, stop } = input;
  const [isStalled, setIsStalled] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset activity timestamp when messages change
  useEffect(() => {
    lastActivityRef.current = Date.now();
    setIsStalled(false);
  }, [messageCount]);

  // Monitor for stalls during streaming
  useEffect(() => {
    if (status !== "streaming") {
      // Not streaming — clean up
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsStalled(false);
      return;
    }

    // Streaming — start monitoring
    lastActivityRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= STALL_TIMEOUT_MS) {
        setIsStalled(true);
        // 逻辑：超时后自动 stop 流，让用户可以手动重试。
        // 不自动重发以避免消息重复。
        stop();
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    }, 5_000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, stop]);

  return { isStalled };
}
