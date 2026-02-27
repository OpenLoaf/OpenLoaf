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

import { useEffect, useMemo } from "react";
import { handleGlobalKeyDown } from "@/lib/globalShortcuts";
import { isElectronEnv } from "@/utils/is-electron-env";

/** 从 Cookie 中读取指定值，用于获取当前 workspaceId。 */
function getCookieValue(name: string) {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return match[1];
  }
}

/** 绑定全局快捷键监听器（仅在客户端运行）。 */
export default function GlobalShortcuts() {
  const isElectron = useMemo(() => isElectronEnv(), []);
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac")),
    [],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) =>
      handleGlobalKeyDown(event, {
        workspaceId: getCookieValue("workspace-id"),
        isElectron,
        isMac,
      });

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isElectron, isMac]);

  return null;
}
