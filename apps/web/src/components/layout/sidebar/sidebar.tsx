"use client";

import { Search, Home, BrainCircuit } from "lucide-react";
import SidebarLeftPages from "@/components/layout/sidebar/sidebar-pages";
import { SidebarWorkspace } from "./sidebar-workspace";
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
  const { addTab } = useTabs();
  const { activeWorkspace } = useWorkspace();

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <SidebarHeader>
        <SidebarWorkspace />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Search className="h-4 w-4" />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    if (!activeWorkspace) return;

                    addTab({
                      title: "AI Chat",
                      leftPanel: {
                        component: "",
                        params: {},
                        hidden: true,
                      },
                      rightPanel: {
                        component: "ai-chat",
                        params: {},
                      },
                      workspaceId: activeWorkspace.id,
                      createNew: true,
                    });
                  }}
                >
                  <BrainCircuit className="h-4 w-4" />
                  <span>AI</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarLeftPages />
      </SidebarContent>
    </Sidebar>
  );
}
