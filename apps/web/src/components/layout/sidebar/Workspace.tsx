"use client";

import * as React from "react";
import { ChevronsUpDown, Plus, Building2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/hooks/use_workspace";

export const SidebarWorkspace = () => {
  const { isMobile } = useSidebar();
  const { workspaces, activeWorkspace, setActiveWorkspace, createWorkspace } =
    useWorkspace();
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
  const [showCreateForm, setShowCreateForm] = React.useState(false);

  if (!activeWorkspace) {
    return null;
  }

  // 处理创建工作区
  const handleCreateWorkspace = async () => {
    if (newWorkspaceName.trim()) {
      await createWorkspace(newWorkspaceName.trim());
      setNewWorkspaceName("");
      setShowCreateForm(false);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="sm"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-6 items-center justify-center rounded-md">
                <Building2 className="size-3" />
              </div>
              <div className="flex-1 text-left text-sm font-medium truncate">
                {activeWorkspace.name}
              </div>
              <ChevronsUpDown className="ml-auto size-3" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.map((workspace, index) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => setActiveWorkspace(workspace)}
                className="gap-2 p-1.5"
              >
                <div className="flex size-5 items-center justify-center rounded-md border">
                  <Building2 className="size-3 shrink-0" />
                </div>
                {workspace.name}
                <DropdownMenuShortcut className="text-xs">
                  ⌘{index + 1}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {showCreateForm ? (
              <DropdownMenuItem className="gap-2 p-1.5">
                <input
                  type="text"
                  placeholder="Workspace name"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === "Enter" && handleCreateWorkspace()
                  }
                  className="w-full px-2 py-1 text-sm border rounded-md"
                  autoFocus
                />
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="gap-2 p-1.5"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowCreateForm(true);
                }}
              >
                <div className="flex size-5 items-center justify-center rounded-md border bg-transparent">
                  <Plus className="size-3" />
                </div>
                <div className="text-muted-foreground font-medium text-sm">
                  Add workspace
                </div>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
