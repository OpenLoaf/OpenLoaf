"use client";

import { useEffect, useMemo } from "react";
import { handleGlobalKeyDown } from "@/lib/globalShortcuts";

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

export default function GlobalShortcuts() {
  const isElectron = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    [],
  );
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
