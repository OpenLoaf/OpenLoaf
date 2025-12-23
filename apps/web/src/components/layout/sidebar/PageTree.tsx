"use client";

import { startTransition } from "react";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/animate-ui/components/radix/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronRight, FileText } from "lucide-react";
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
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const { workspace } = useWorkspace();

  const Collapsible = CollapsiblePrimitive.Root;
  const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
  const CollapsibleContent = CollapsiblePrimitive.Content;

  const buildTabInput = (page: PageTreeNode) => {
    if (!workspace?.id) return;
    return {
      workspaceId: workspace.id,
      createNew: true,
      title: page.title || "Untitled Page",
      icon: page.icon ?? undefined,
      base: {
        id: `base:${page.id}`,
        component: "plant-page",
        params: { pageId: page.id },
      },
      chatParams: { pageId: page.id },
    };
  };

  const openInNewTab = (page: PageTreeNode) => {
    const input = buildTabInput(page);
    if (!input) return;
    const baseId = input.base?.id;
    if (baseId) {
      const state = useTabs.getState();
      const existing = state.tabs.find(
        (tab) => tab.workspaceId === input.workspaceId && tab.base?.id === baseId,
      );
      if (existing) {
        startTransition(() => {
          setActiveTab(existing.id);
        });
        return;
      }
    }

    addTab(input);
  };

  const handlePrimaryClick = (event: React.MouseEvent, page: PageTreeNode) => {
    event.preventDefault();
    openInNewTab(page);
  };

  const handleMouseDown = (event: React.MouseEvent, page: PageTreeNode) => {
    if (event.button !== 1) return;
    event.preventDefault();
    openInNewTab(page);
  };

  const handleDoubleClick = (event: React.MouseEvent, page: PageTreeNode) => {
    event.preventDefault();
    openInNewTab(page);
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
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={pageTitle}
                    size="default"
                    className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
                    onClick={(event) => handlePrimaryClick(event, page)}
                    onMouseDown={(event) => handleMouseDown(event, page)}
                    onDoubleClick={(event) => handleDoubleClick(event, page)}
                  >
                    {page.icon ? (
                      <span className="text-sm leading-none">{page.icon}</span>
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span>{pageTitle}</span>
                  </SidebarMenuButton>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={() => openInNewTab(page)}>
                    Open in new tab
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
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
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={pageTitle}
                    size="default"
                    className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
                    onClick={(event) => handlePrimaryClick(event, page)}
                    onMouseDown={(event) => handleMouseDown(event, page)}
                    onDoubleClick={(event) => handleDoubleClick(event, page)}
                  >
                    {page.icon ? (
                      <span className="text-sm leading-none">{page.icon}</span>
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span>{pageTitle}</span>
                  </SidebarMenuButton>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={() => openInNewTab(page)}>
                    Open in new tab
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <CollapsibleTrigger asChild>
                <SidebarMenuAction
                  aria-label="Toggle"
                  className="text-muted-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                >
                  <ChevronRight className="transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuAction>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <SidebarMenuSub className="mx-1 px-1">
                  {page.children.map((child) => {
                    const childTitle = child.title || "Untitled Page";

                    return (
                      <SidebarMenuSubItem key={child.id}>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <SidebarMenuSubButton
                              href="#"
                              size="md"
                              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
                              onClick={(event) => {
                                event.preventDefault();
                                handlePrimaryClick(event, child);
                              }}
                              onMouseDown={(event) => handleMouseDown(event, child)}
                              onDoubleClick={(event) => handleDoubleClick(event, child)}
                            >
                              {child.icon ? (
                                <span className="text-sm leading-none">{child.icon}</span>
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                              <span>{childTitle}</span>
                            </SidebarMenuSubButton>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-52">
                            <ContextMenuItem onClick={() => openInNewTab(child)}>
                              Open in new tab
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
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
