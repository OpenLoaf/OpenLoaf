"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/animate-ui/components/radix/sidebar";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { useWorkspace } from "@/components/workspace/workspaceContext";
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

  return (
    <>
      {/* Nav Main */}
      <CollapsiblePrimitive.Root
        open={isPlatformOpen}
        onOpenChange={setIsPlatformOpen}
        asChild
      >
        <SidebarGroup className="group pt-0">
          <CollapsiblePrimitive.Trigger asChild>
            <SidebarGroupLabel className="cursor-pointer">
              项目
            </SidebarGroupLabel>
          </CollapsiblePrimitive.Trigger>
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
