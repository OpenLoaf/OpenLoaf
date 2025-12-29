"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/animate-ui/components/radix/sidebar";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { PageTreeMenu } from "./PageTree";

export const SidebarPage = () => {
  const { data: projects = [] } = useQuery(
    trpc.project.list.queryOptions()
  );

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {}
  );

  const [isPlatformOpen, setIsPlatformOpen] = useState(true);

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
              <span className="text-muted-foreground">项目</span>
            </SidebarGroupLabel>
          </CollapsiblePrimitive.Trigger>
          <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <SidebarMenu>
              <PageTreeMenu
                projects={projects}
                expandedNodes={expandedNodes}
                setExpandedNodes={setExpandedNodes}
              />
            </SidebarMenu>
          </CollapsiblePrimitive.Content>
        </SidebarGroup>
      </CollapsiblePrimitive.Root>
    </>
  );
};
