"use client";
import { useState, useEffect } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/layout/header";
import SidebarLeft from "@/components/layout/sidebar-left";
import MainLayout from "@/components/layout/main";

export default function Page() {
  return (
    <div className="[--header-height:calc(--spacing(10))] bg-sidebar">
      <SidebarProvider className="flex flex-col">
        <Header />
        <div className="flex flex-1">
          <SidebarLeft />
          <SidebarInset className=" mr-2 h-[calc(calc(100svh-var(--header-height))-0.5rem)]!">
            <MainLayout />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
