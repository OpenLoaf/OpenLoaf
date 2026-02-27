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

type IdleMountOptions = {
  timeoutMs?: number;
};

type IdleCallbackMode = "idle" | "timeout";

const DEFAULT_IDLE_TIMEOUT_MS = 360;

/** Check whether requestIdleCallback can be used in this environment. */
function canUseIdleCallback() {
  return typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
}

/** Defer mounting work until the browser is idle (or timed out). */
export function useIdleMount(enabled: boolean, options?: IdleMountOptions) {
  const [mounted, setMounted] = useState(false);
  const idleHandleRef = useRef<number | null>(null);
  const idleModeRef = useRef<IdleCallbackMode | null>(null);

  useEffect(() => {
    if (!enabled || mounted) return;

    // 逻辑：通过 idle/timeout 延后重组件挂载，避免切换时阻塞主线程。
    const timeoutMs = options?.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    let cancelled = false;

    /** Mount callback triggered by idle or timeout. */
    const handleIdle = () => {
      if (cancelled) return;
      setMounted(true);
    };

    if (canUseIdleCallback()) {
      idleModeRef.current = "idle";
      idleHandleRef.current = window.requestIdleCallback(handleIdle, {
        timeout: timeoutMs,
      });
    } else {
      idleModeRef.current = "timeout";
      idleHandleRef.current = window.setTimeout(handleIdle, timeoutMs);
    }

    return () => {
      cancelled = true;
      const handle = idleHandleRef.current;
      if (handle === null) return;

      if (idleModeRef.current === "idle" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }

      idleHandleRef.current = null;
      idleModeRef.current = null;
    };
  }, [enabled, mounted, options?.timeoutMs]);

  return mounted;
}
