"use client";

import { useState } from "react";
import { useQuery, useMutation, skipToken } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/animate-ui/components/radix/sidebar";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ListCollapse, ListTree } from "lucide-react";
import { useWorkspace } from "@/app/page";
import { PageTreeMenu } from "./PageTree";

export const SidebarPage = () => {
  const { workspace } = useWorkspace();
  console.log("==workspace==", workspace);
  // 使用 trpc 接口获取页面树数据
  const { data: pageTreeNodes = [] } = useQuery(
    trpc.pageCustom.getAll.queryOptions({ workspaceId: workspace.id })
  );

  console.log("pageTreeNodes", pageTreeNodes);

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>(
    {}
  );

  const [isPlatformOpen, setIsPlatformOpen] = useState(true);

  // 使用 trpc 更新页面的 isExpanded 状态
  const updatePage = useMutation(trpc.page.updateOnePage.mutationOptions());

  const collapsiblePages = pageTreeNodes.filter((page) => page.children.length);
  const areAllExpanded =
    collapsiblePages.length > 0 &&
    collapsiblePages.every(
      (page) => (expandedPages[page.id] ?? page.isExpanded) === true
    );

  const toggleAllExpanded = () => {
    if (collapsiblePages.length === 0) return;

    const nextExpanded = !areAllExpanded;

    setExpandedPages((prev) => {
      const next = { ...prev };
      for (const page of collapsiblePages) {
        next[page.id] = nextExpanded;
      }
      return next;
    });

    for (const page of collapsiblePages) {
      const currentExpanded = expandedPages[page.id] ?? page.isExpanded;
      if (currentExpanded !== nextExpanded) {
        updatePage.mutate({
          where: { id: page.id },
          data: { isExpanded: nextExpanded },
        });
      }
    }
  };

  return (
    <>
      {/* Nav Main */}
      <CollapsiblePrimitive.Root
        open={isPlatformOpen}
        onOpenChange={setIsPlatformOpen}
        asChild
      >
        <SidebarGroup className="group">
          <CollapsiblePrimitive.Trigger asChild>
            <SidebarGroupLabel className="cursor-pointer">
              Platform
            </SidebarGroupLabel>
          </CollapsiblePrimitive.Trigger>
          {isPlatformOpen && (
            <SidebarGroupAction
              aria-label={areAllExpanded ? "Collapse all" : "Expand all"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleAllExpanded();
              }}
              title={areAllExpanded ? "Collapse all" : "Expand all"}
              className="text-sidebar-foreground/70 pointer-events-none opacity-0 translate-y-0.5 scale-95 transition-[opacity,transform] duration-200 ease-out hover:text-sidebar-foreground/70 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100"
            >
              {areAllExpanded ? <ListCollapse /> : <ListTree />}
            </SidebarGroupAction>
          )}
          <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <SidebarMenu>
              <PageTreeMenu
                // @ts-ignore
                pages={pageTreeNodes}
                expandedPages={expandedPages}
                setExpandedPages={setExpandedPages}
                updatePage={updatePage}
              />
            </SidebarMenu>
          </CollapsiblePrimitive.Content>
        </SidebarGroup>
      </CollapsiblePrimitive.Root>
    </>
  );
};
