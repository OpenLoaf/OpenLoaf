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
import { useEffect, type CSSProperties } from "react";

import {
  SidebarInset,
  SidebarProvider,
} from "@openloaf/ui/sidebar";
import { AppBootstrap } from "@/components/layout/AppBootstrap";
import { LayoutStateBridge } from "@/components/layout/LayoutStateBridge";
import { Header } from "@/components/layout/header/Header";
import { AppSidebar } from "@/components/layout/sidebar/Sidebar";
import { MainContent } from "@/components/layout/MainContext";
import { cn } from "@/lib/utils";
import { FeedbackDialog } from "@/components/layout/sidebar/FeedbackDialog";
import { isElectronEnv } from "@/utils/is-electron-env";

// Mac 顶部留给红绿灯，sidebar 保持在 header 下方；Linux/Windows 没有红绿灯，把 sidebar 放到左列贴顶，header 只占右列。
const isMacPlatform =
  typeof navigator !== "undefined" &&
  (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac"));

// Linux 下窗口无原生圆角，主进程设置 transparent: true，这里负责让 html/body 透明并在根节点应用圆角。
const isLinuxElectron =
  typeof navigator !== "undefined" &&
  navigator.userAgent.includes("Linux") &&
  isElectronEnv();

function PageContent() {
  if (isMacPlatform) {
    return (
      <>
        <LayoutStateBridge />
        <Header />
        <div
          data-slot="page-main-row"
          className={cn("flex flex-1 min-w-0 overflow-hidden")}
        >
          <AppSidebar />
          <SidebarInset className=" h-[calc(calc(100svh-var(--header-height))-0.5rem)]!">
            <MainContent />
          </SidebarInset>
        </div>
        <FeedbackDialog />
      </>
    );
  }
  return (
    <>
      <LayoutStateBridge />
      <AppSidebar />
      <div
        data-slot="page-main-col"
        className={cn("flex flex-col flex-1 min-w-0 overflow-hidden")}
      >
        <Header />
        <div
          data-slot="page-main-row"
          className={cn("flex flex-1 min-w-0 overflow-hidden")}
        >
          <SidebarInset className=" h-[calc(calc(100svh-var(--header-height))-0.5rem)]!">
            <MainContent />
          </SidebarInset>
        </div>
      </div>
      <FeedbackDialog />
    </>
  );
}

export default function Page() {
  useEffect(() => {
    if (!isLinuxElectron) return;
    document.documentElement.setAttribute("data-ol-linux-rounded", "1");
    return () => {
      document.documentElement.removeAttribute("data-ol-linux-rounded");
    };
  }, []);

  return (
    <div
      className={cn(
        "[--header-height:calc(--spacing(10))] bg-sidebar overflow-hidden h-svh",
        isLinuxElectron && "rounded-xl",
      )}
    >
      <AppBootstrap />
      <SidebarProvider
          className={cn(isMacPlatform ? "flex flex-col" : "flex flex-row")}
          style={{ "--sidebar-width": "3.5rem" } as CSSProperties}
        >
          <PageContent />
        </SidebarProvider>
    </div>
  );
}
