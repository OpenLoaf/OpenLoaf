"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/trpc";
import { useDisableContextMenu } from "@/lib/useDisableContextMenu";
import { ThemeProvider } from "./ThemeProvider";

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
