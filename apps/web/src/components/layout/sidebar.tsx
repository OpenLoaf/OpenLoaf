"use client";

import { Search, Home, BrainCircuit } from "lucide-react";
import { SidebarPage } from "@/components/layout/sidebar/Page";
import { SidebarWorkspace } from "./sidebar/Workspace";
import { useTabs } from "@/hooks/use_tabs";
import { useWorkspace } from "@/hooks/use_workspace";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from "@/components/ui/sidebar";

export default function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <SidebarHeader>
        <SidebarWorkspace />
      </SidebarHeader>
      <SidebarContent>
        <SidebarPage />
      </SidebarContent>
    </Sidebar>
  );
}
