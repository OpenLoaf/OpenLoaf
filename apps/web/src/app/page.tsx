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
import type { CSSProperties } from "react";

import {
  SidebarInset,
  SidebarProvider,
} from "@openloaf/ui/sidebar";
import { AppBootstrap } from "@/components/layout/AppBootstrap";
import { Header } from "@/components/layout/header/Header";
import { AppSidebar } from "@/components/layout/sidebar/Sidebar";
import { MainContent } from "@/components/layout/MainContext";
import { cn } from "@/lib/utils";

function PageContent() {
  return (
    <>
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
    </>
  );
}

export default function Page() {
  return (
    <div className="[--header-height:calc(--spacing(10))] bg-sidebar">
      <AppBootstrap />
      <SidebarProvider
          className="flex flex-col"
          style={{ "--sidebar-width": "3.5rem" } as CSSProperties}
        >
          <PageContent />
        </SidebarProvider>
    </div>
  );
}
