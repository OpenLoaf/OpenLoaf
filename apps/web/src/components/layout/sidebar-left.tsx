"use client";

import { Search, Home, BrainCircuit } from "lucide-react";
import PageTreeComponent from "@/components/layout/header-tree";
import { useTabs } from "@/hooks/use_tabs";

export default function SidebarLeft() {
  const { addTab } = useTabs();

  const handleAiClick = () => {
    addTab({
      id: `chat-${Date.now()}`,
      title: "AI Chat",
      type: "chat",
    });
  };

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scroll">
        {/* Main menu items */}
        <div className="flex flex-col p-2">
          <div className="p-2 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span>Search</span>
          </div>
          <div className="p-2 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" />
            <span>Home</span>
          </div>
          <div
            className="p-2 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2 cursor-pointer"
            onClick={handleAiClick}
          >
            <BrainCircuit className="h-4 w-4 text-muted-foreground" />
            <span>AI</span>
          </div>
        </div>

        {/* Page tree */}
        <div className="p-2">
          <PageTreeComponent />
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2 border-t border-sidebar-border">
        <div className="p-2 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          User info placeholder
        </div>
      </div>
    </div>
  );
}
