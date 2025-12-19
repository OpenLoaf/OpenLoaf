"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/trpc";
import { useDisableContextMenu } from "@/lib/useDisableContextMenu";
import { ThemeProvider } from "./ThemeProvider";
import { installUiEventElectronIpcListener } from "@/lib/chat/uiEventElectronIpc";
import { handleUiEvent } from "@/lib/chat/uiEvent";
import type { UiEvent } from "@teatime-ai/api";

export default function Providers({ children }: { children: React.ReactNode }) {
  useDisableContextMenu();

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
