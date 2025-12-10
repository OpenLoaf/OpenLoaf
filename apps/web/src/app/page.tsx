"use client";
import { useState, useEffect } from "react";

import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Header } from "@/components/layout/header/Header";
import { AppSidebar } from "@/components/layout/sidebar/Sidebar";
import { MainContent } from "@/components/layout/MainContext";
import { cn } from "@/lib/utils";

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
      <SidebarProvider className="flex flex-col">
        <PageContent />
      </SidebarProvider>
    </div>
  );
}
