"use client";

import { useState } from "react";
import { useQuery, useMutation, skipToken } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/hooks/use_workspace";
import { PageTreeMenu } from "./PageTree";

export const SidebarPage = () => {
  const { activeWorkspace } = useWorkspace();

  // 使用 trpc 接口获取页面树数据
  const { data: pages = [] } = useQuery(
    trpc.page.getAll.queryOptions(
      activeWorkspace ? { workspaceId: activeWorkspace.id } : skipToken
    )
  );

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>(
    {}
  );

  // 控制 SidebarGroupContent 显示/隐藏的状态
  const [isGroupExpanded, setIsGroupExpanded] = useState(true);

  // 使用 trpc 更新页面的 isExpanded 状态
  const updatePage = useMutation(trpc.page.update.mutationOptions());

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        onClick={() => setIsGroupExpanded(!isGroupExpanded)}
        className="cursor-pointer"
      >
        Pages
      </SidebarGroupLabel>
      {isGroupExpanded && (
        <SidebarGroupContent>
          <SidebarMenu>
            <PageTreeMenu
              pages={pages}
              expandedPages={expandedPages}
              setExpandedPages={setExpandedPages}
              updatePage={updatePage}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
};
