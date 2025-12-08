"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { ChevronRight, MoreHorizontal, FileText } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useTabs } from "@/hooks/use_tabs";

// 定义页面类型
interface Page {
  id: string;
  title: string | null;
  icon: string | null;
  isExpanded: boolean;
  children: Page[];
  resources: any[];
}

// 递归渲染页面树
const PageTreeMenu = ({
  pages,
  expandedPages,
  setExpandedPages,
  updatePage,
}: {
  pages: Page[];
  expandedPages: Record<string, boolean>;
  setExpandedPages: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  updatePage: any;
}) => {
  const { addTab } = useTabs();

  const handlePageClick = (page: Page) => {
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

export default function SidebarLeftPages() {
  // 使用 trpc 接口获取页面树数据
  const { data: pages = [] } = useQuery(trpc.page.getAll.queryOptions());

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>(
    {}
  );

  // 使用 trpc 更新页面的 isExpanded 状态
  const updatePage = useMutation(trpc.page.update.mutationOptions());

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Pages</SidebarGroupLabel>
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
    </SidebarGroup>
  );
}
