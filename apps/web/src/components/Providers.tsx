"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/trpc";
import { useDisableContextMenu } from "@/lib/useDisableContextMenu";
import { ThemeProvider } from "./ThemeProvider";
import { handleUiEvent } from "@/lib/chat/uiEvent";
import type { UiEvent } from "@teatime-ai/api";
import { usePrewarmPlate } from "@/hooks/use-prewarm-plate";

export default function Providers({ children }: { children: React.ReactNode }) {
  useDisableContextMenu();
  // 中文注释：应用空闲时预热编辑器相关模块，降低首次打开时的卡顿峰值。
  usePrewarmPlate();

  useEffect(() => {
    const isElectron =
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron"));

    document.documentElement.classList.toggle(
      "macos",
      typeof navigator !== "undefined" &&
        navigator.platform.toLowerCase().includes("mac")
    );

    document.documentElement.classList.toggle("electron", isElectron);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    /** Suppress ResizeObserver loop errors from dev overlay noise. */
    const handleResizeObserverError = (event: ErrorEvent) => {
      if (event.message !== "ResizeObserver loop completed with undelivered notifications.") return;
      // 过滤 ResizeObserver 循环错误，避免开发环境叠加报错。
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("error", handleResizeObserverError, true);
    return () => window.removeEventListener("error", handleResizeObserverError, true);
  }, []);

  useEffect(() => {
    // Electron 主进程会通过 preload 桥接 `teatime:ui-event`，这里统一交给 handleUiEvent 分发。
    const onUiEvent = (event: Event) => {
      const detail = (event as CustomEvent<UiEvent>).detail;
      handleUiEvent(detail);
    };
    window.addEventListener("teatime:ui-event", onUiEvent);
    return () => window.removeEventListener("teatime:ui-event", onUiEvent);
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
