"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/trpc";
import { useDisableContextMenu } from "@/lib/useDisableContextMenu";
import { ThemeProvider } from "./ThemeProvider";
import { checkIsRunningInTauri } from "@/utils/tauri";

export default function Providers({ children }: { children: React.ReactNode }) {
  useDisableContextMenu();

  useEffect(() => {
    document.documentElement.classList.toggle("tauri", checkIsRunningInTauri());
    document.documentElement.classList.toggle(
      "macos",
      typeof navigator !== "undefined" &&
        navigator.platform.toLowerCase().includes("mac")
    );
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
