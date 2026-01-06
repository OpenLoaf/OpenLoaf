"use client";
import type { CSSProperties } from "react";

import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Header } from "@/components/layout/header/Header";
import { AppSidebar } from "@/components/layout/sidebar/Sidebar";
import { MainContent } from "@/components/layout/MainContext";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { cn } from "@/lib/utils";

function PageContent() {
  const { open } = useSidebar();

  return (
    <>
      <Header />
      <div
        data-slot="page-main-row"
        className={cn("flex flex-1 min-w-0 overflow-hidden", !open && "ml-2")}
      >
        <AppSidebar />
        <SidebarInset className=" h-[calc(calc(100svh-var(--header-height))-0.5rem)]!">
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
