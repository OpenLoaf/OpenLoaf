"use client";
import { useState, useEffect } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/layout/header";
import { AppSidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/main-content";

export default function Page() {
  return (
    <div className="[--header-height:calc(--spacing(10))] bg-sidebar">
      <SidebarProvider className="flex flex-col">
        <Header />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className=" mr-2 h-[calc(calc(100svh-var(--header-height))-0.5rem)]!">
            <MainContent />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
