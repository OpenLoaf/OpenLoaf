"use client";

import { Building2 } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/animate-ui/components/radix/sidebar";
import { useWorkspace } from "@/components/workspace/workspaceContext";

export const SidebarWorkspace = () => {
  const { workspace } = useWorkspace();

  if (!workspace?.id) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          className="bg-sidebar-accent text-sidebar-accent-foreground"
        >
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-6 items-center justify-center rounded-md">
            <Building2 className="size-3" />
          </div>
          <div className="flex-1 text-left text-sm font-medium truncate">
            {workspace.name}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
