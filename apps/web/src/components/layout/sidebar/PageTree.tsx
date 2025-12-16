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
  const openPreviewTab = useTabs((s) => s.openPreviewTab);
  const promoteTab = useTabs((s) => s.promoteTab);
  const { workspace } = useWorkspace();

  const Collapsible = CollapsiblePrimitive.Root;
  const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
  const CollapsibleContent = CollapsiblePrimitive.Content;

  const buildPreviewInput = (page: PageTreeNode) => {
    if (!workspace?.id) return;
    return {
      workspaceId: workspace.id,
      resourceId: `page:${page.id}`,
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

  const openInPreview = (page: PageTreeNode) => {
    const input = buildPreviewInput(page);
    if (!input) return;
    // 单击默认打开“预览标签”：同 workspace 只保留一个，重复单击会复用该标签。
    openPreviewTab(input);
  };

  const promoteActiveIfPreviewMatches = (page: PageTreeNode) => {
    const state = useTabs.getState();
    const activeTabId = state.activeTabId;
    if (!activeTabId) return false;
    const activeTab = state.tabs.find((t) => t.id === activeTabId);
    if (!activeTab?.isPreview) return false;
    if (activeTab.resourceId !== `page:${page.id}`) return false;
    // 双击同一条目：如果当前激活的就是这个预览标签，则直接“升级”为正式标签（不新开）。
    promoteTab(activeTabId);
    return true;
  };

  const openAndPromote = (page: PageTreeNode) => {
    // 明确“新标签”语义：先打开（可能复用预览标签），再把激活 tab 升级为正式标签。
    openInPreview(page);
    const nextActiveTabId = useTabs.getState().activeTabId;
    if (nextActiveTabId) {
      promoteTab(nextActiveTabId);
    }
  };

  const handlePrimaryClick = (event: React.MouseEvent, page: PageTreeNode) => {
    // Ctrl/⌘ + 单击：直接按“新标签”策略打开（升级为正式标签）。
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      openAndPromote(page);
      return;
    }
    openInPreview(page);
  };

  const handleMouseDown = (event: React.MouseEvent, page: PageTreeNode) => {
    // 中键：按“新标签”策略打开（升级为正式标签）。
    if (event.button !== 1) return;
    event.preventDefault();
    openAndPromote(page);
  };

  const handleDoubleClick = (event: React.MouseEvent, page: PageTreeNode) => {
    // 双击：优先升级当前预览标签；否则按“新标签”策略打开。
    event.preventDefault();
    if (!promoteActiveIfPreviewMatches(page)) {
      openAndPromote(page);
    }
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
                    onClick={(event) => handlePrimaryClick(event, page)}
                    onMouseDown={(event) => handleMouseDown(event, page)}
                    onDoubleClick={(event) => handleDoubleClick(event, page)}
                  >
                    {page.icon ? (
                      <span className="text-sm">{page.icon}</span>
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{pageTitle}</span>
                  </SidebarMenuButton>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={() => openAndPromote(page)}>
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
                    onClick={(event) => handlePrimaryClick(event, page)}
                    onMouseDown={(event) => handleMouseDown(event, page)}
                    onDoubleClick={(event) => handleDoubleClick(event, page)}
                  >
                    {page.icon ? (
                      <span className="text-sm">{page.icon}</span>
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{pageTitle}</span>
                  </SidebarMenuButton>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={() => openAndPromote(page)}>
                    Open in new tab
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
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
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                              <a
                                href="#"
                                onClick={(event) => {
                                  event.preventDefault();
                                  handlePrimaryClick(event, child);
                                }}
                                onMouseDown={(event) => handleMouseDown(event, child)}
                                onDoubleClick={(event) => handleDoubleClick(event, child)}
                              >
                                <span>{childTitle}</span>
                              </a>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-52">
                              <ContextMenuItem onClick={() => openAndPromote(child)}>
                                Open in new tab
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
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
