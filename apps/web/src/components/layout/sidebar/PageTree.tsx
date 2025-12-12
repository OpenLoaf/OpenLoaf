"use client";

import { useTabs } from "@/hooks/use_tabs";
import { useWorkspace } from "@/app/page";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { ChevronRight, FileText, MoreHorizontal } from "lucide-react";
import type { PageTreeNode } from "@teatime-ai/api/routers/page";

interface PageTreeMenuProps {
  pages: PageTreeNode[];
  expandedPages: Record<string, boolean>;
  setExpandedPages: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  updatePage: any;
}

export const PageTreeMenu = ({
  pages,
  expandedPages,
  setExpandedPages,
  updatePage,
}: PageTreeMenuProps) => {
  const { addTab } = useTabs();
  const { workspace } = useWorkspace();

  const handlePageClick = (page: PageTreeNode) => {
    if (!workspace?.id) return;

    addTab({
      id: page.id,
      title: page.title || "Untitled Page",
      leftPanel: {
        component: "plant-page",
        params: { pageId: page.id },
      },
      rightPanel: {
        component: "ai-chat",
        params: { pageId: page.id },
      },
      workspaceId: workspace.id,
      createNew: false,
    });
  };

  const toggleExpand = (pageId: string) => {
    const currentIsExpanded = expandedPages[pageId] || false;
    const newExpandedState = !currentIsExpanded;
    setExpandedPages((prev) => ({
      ...prev,
      [pageId]: newExpandedState,
    }));
    updatePage.mutate({
      id: pageId,
      isExpanded: newExpandedState,
    });
  };

  return (
    <>
      {pages.map((page) => {
        const isExpanded = expandedPages[page.id] ?? page.isExpanded;
        const hasChildren = page.children.length > 0;

        return (
          <SidebarMenuItem key={page.id}>
            <SidebarMenuButton onClick={() => handlePageClick(page)}>
              {page.icon ? (
                <span className="text-sm">{page.icon}</span>
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{page.title || "Untitled Page"}</span>
            </SidebarMenuButton>
            {hasChildren && (
              <SidebarMenuAction
                className={`bg-sidebar-accent text-sidebar-accent-foreground left-2 transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`}
                onClick={() => toggleExpand(page.id)}
                showOnHover
              >
                <ChevronRight />
              </SidebarMenuAction>
            )}
            <SidebarMenuAction showOnHover>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </SidebarMenuAction>
            {hasChildren && isExpanded && (
              <SidebarMenuSub>
                {page.children.map((child) => (
                  <SidebarMenuSubItem key={child.id}>
                    <SidebarMenuSubButton
                      onClick={() => handlePageClick(child)}
                    >
                      {child.icon ? (
                        <span className="text-sm">{child.icon}</span>
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{child.title || "Untitled Page"}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>
        );
      })}
    </>
  );
};
