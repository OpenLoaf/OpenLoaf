"use client";
import { useState, useEffect, createContext, useContext, type CSSProperties } from "react";
import type { Workspace } from "@teatime-ai/api";

import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/animate-ui/components/radix/sidebar";
import { Header } from "@/components/layout/header/Header";
import { AppSidebar } from "@/components/layout/sidebar/Sidebar";
import { MainContent } from "@/components/layout/MainContext";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { cn } from "@/lib/utils";

// 创建并导出 WorkspaceContext
export const WorkspaceContext = createContext<{
  workspace: Workspace;
  isLoading: boolean;
}>({
  workspace: {} as Workspace,
  isLoading: true,
});

// 导出自定义 hook 以便于使用
export const useWorkspace = () => useContext(WorkspaceContext);

function PageContent() {
  const { open } = useSidebar();

  return (
    <>
      <Header />
      <div className={cn("flex flex-1", !open && "ml-2")}>
        <AppSidebar />
        <SidebarInset className=" mr-2 h-[calc(calc(100svh-var(--header-height))-0.5rem)]!">
          <MainContent />
        </SidebarInset>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <div className="[--header-height:calc(--spacing(10))] bg-sidebar">
      <WorkspaceProvider>
        <SidebarProvider
          className="flex flex-col"
          style={{ "--sidebar-width": "14rem" } as CSSProperties}
        >
          <PageContent />
        </SidebarProvider>
      </WorkspaceProvider>
    </div>
  );
}
