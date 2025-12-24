"use client";

import { startTransition, useMemo, useState } from "react";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/animate-ui/components/radix/sidebar";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronRight, FileText } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import type { PageTreeNode } from "@teatime-ai/api/services/pageService";

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
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabs = useTabs((s) => s.tabs);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const deletePage = useMutation(trpc.page.deleteOnePage.mutationOptions());
  const [renameValue, setRenameValue] = useState("");
  const [renameTarget, setRenameTarget] = useState<PageTreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PageTreeNode | null>(null);
  const [contextSelectedPageId, setContextSelectedPageId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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
      leftWidthPercent: 90,
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

  /** Return the active page id derived from the active tab base id. */
  const activePageId = useMemo(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const baseId = String(activeTab?.base?.id ?? "");
    if (!baseId.startsWith("base:")) return null;
    return baseId.replace("base:", "");
  }, [activeTabId, tabs]);

  /** Check whether the given page should be highlighted as active. */
  const isActivePage = (page: PageTreeNode) => {
    return Boolean(activePageId && activePageId === page.id);
  };

  /** Open rename dialog for the selected page. */
  const openRenameDialog = (page: PageTreeNode) => {
    setRenameValue(page.title || "未命名页面");
    setRenameTarget(page);
  };

  /** Open delete dialog for the selected page. */
  const openDeleteDialog = (page: PageTreeNode) => {
    if (page.children.length > 0) {
      toast.error("请先删除子页面");
      return;
    }
    setDeleteTarget(page);
  };

  /** Rename the selected page. */
  const handleRename = async () => {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) return;

    try {
      setIsBusy(true);
      await updatePage.mutateAsync({
        where: { id: renameTarget.id },
        data: { title },
      });
      toast.success("重命名成功");
      setRenameTarget(null);
      setRenameValue("");
      queryClient.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "重命名失败");
    } finally {
      setIsBusy(false);
    }
  };

  /** Delete the selected page. */
  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      setIsBusy(true);
      await deletePage.mutateAsync({ where: { id: deleteTarget.id } });
      toast.success("已删除");
      setDeleteTarget(null);
      queryClient.invalidateQueries();
    } catch (err: any) {
      toast.error(err?.message ?? "删除失败");
    } finally {
      setIsBusy(false);
    }
  };

  /** Render context menu items for a page entry. */
  const renderContextMenuContent = (page: PageTreeNode) => (
    <ContextMenuContent className="w-52">
      <ContextMenuItem onClick={() => openInNewTab(page)}>
        在新标签页打开
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => openRenameDialog(page)}>
        重命名
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => openDeleteDialog(page)}
        disabled={page.children.length > 0}
      >
        删除
      </ContextMenuItem>
    </ContextMenuContent>
  );

  /** Track context menu selection state for highlight. */
  const handleContextMenuOpenChange = (page: PageTreeNode, open: boolean) => {
    setContextSelectedPageId(open ? page.id : null);
  };

  return (
    <>
      {pages.map((page) => {
        const isExpanded = expandedPages[page.id] ?? page.isExpanded;
        const hasChildren = page.children.length > 0;
        const pageTitle = page.title || "Untitled Page";
        const isActive = isActivePage(page) || contextSelectedPageId === page.id;

        if (!hasChildren) {
          return (
            <SidebarMenuItem key={page.id}>
              <ContextMenu onOpenChange={(open) => handleContextMenuOpenChange(page, open)}>
                <ContextMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={pageTitle}
                    size="default"
                    isActive={isActive}
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
                {renderContextMenuContent(page)}
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
              <ContextMenu onOpenChange={(open) => handleContextMenuOpenChange(page, open)}>
                <ContextMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={pageTitle}
                    size="default"
                    isActive={isActive}
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
                {renderContextMenuContent(page)}
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
                  {page.children.map((child: PageTreeNode) => {
                    const childTitle = child.title || "Untitled Page";
                    const isChildActive =
                      isActivePage(child) || contextSelectedPageId === child.id;

                    return (
                      <SidebarMenuSubItem key={child.id}>
                        <ContextMenu onOpenChange={(open) => handleContextMenuOpenChange(child, open)}>
                          <ContextMenuTrigger asChild>
                            <SidebarMenuSubButton
                              href="#"
                              size="md"
                              isActive={isChildActive}
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
                          {renderContextMenuContent(child)}
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

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => {
        if (open) return;
        setRenameTarget(null);
        setRenameValue("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名页面</DialogTitle>
            <DialogDescription>请输入新的页面名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="page-title" className="text-right">
                名称
              </Label>
              <Input
                id="page-title"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">取消</Button>
            </DialogClose>
            <Button onClick={handleRename} disabled={isBusy}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
        if (open) return;
        setDeleteTarget(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除这个页面吗？此操作无法撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">取消</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
