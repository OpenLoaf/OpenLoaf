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
} from "@/components/animate-ui/components/radix/sidebar";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronRight, FileText } from "lucide-react";
import type { PageTreeNode } from "@teatime-ai/api/routers/page";
import { generateId } from "ai";

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

  const Collapsible = CollapsiblePrimitive.Root;
  const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
  const CollapsibleContent = CollapsiblePrimitive.Content;

  const handlePageClick = (page: PageTreeNode) => {
    if (!workspace?.id) return;

    addTab({
      id: page.id,
      title: page.title || "Untitled Page",
      icon: page.icon ?? undefined,
      leftPanel: {
        component: "plant-page",
        panelKey: generateId(),
        params: { pageId: page.id },
      },
      rightPanel: {
        component: "ai-chat",
        panelKey: generateId(),
        params: { pageId: page.id },
      },
      workspaceId: workspace.id,
      createNew: false,
    });
  };

  const setExpanded = (pageId: string, isExpanded: boolean) => {
    setExpandedPages((prev) => ({
      ...prev,
      [pageId]: isExpanded,
    }));
    updatePage.mutate({
      where: { id: pageId },
      data: { isExpanded },
    });
  };

  return (
    <>
      {pages.map((page) => {
        const isExpanded = expandedPages[page.id] ?? page.isExpanded;
        const hasChildren = page.children.length > 0;
        const pageTitle = page.title || "Untitled Page";

        if (!hasChildren) {
          return (
            <SidebarMenuItem key={page.id}>
              <SidebarMenuButton
                tooltip={pageTitle}
                onClick={() => handlePageClick(page)}
              >
                {page.icon ? (
                  <span className="text-sm">{page.icon}</span>
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{pageTitle}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }

        return (
          <Collapsible
            key={page.id}
            asChild
            open={isExpanded}
            onOpenChange={(open) => setExpanded(page.id, open)}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={pageTitle}
                onClick={() => handlePageClick(page)}
              >
                {page.icon ? (
                  <span className="text-sm">{page.icon}</span>
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{pageTitle}</span>
              </SidebarMenuButton>
              <CollapsibleTrigger asChild>
                <SidebarMenuAction aria-label="Toggle">
                  <ChevronRight className="transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuAction>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <SidebarMenuSub>
                  {page.children.map((child) => {
                    const childTitle = child.title || "Untitled Page";

                    return (
                      <SidebarMenuSubItem key={child.id}>
                        <SidebarMenuSubButton asChild>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              handlePageClick(child);
                            }}
                          >
                            <span>{childTitle}</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </>
  );
};
