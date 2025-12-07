"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemActions,
  ItemTitle,
  ItemHeader,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";

// 定义页面类型
interface Page {
  id: string;
  title: string | null;
  isExpanded: boolean;
  children: Page[];
  resources: any[];
}

// 递归渲染页面树
const PageTree = ({ pages }: { pages: Page[] }) => {
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>(
    {}
  );
  const [hoveredPage, setHoveredPage] = useState<string | null>(null);

  const toggleExpand = (pageId: string) => {
    setExpandedPages((prev) => ({
      ...prev,
      [pageId]: !prev[pageId],
    }));
  };

  return (
    <div className="flex flex-col gap-1">
      {pages.map((page) => {
        const isExpanded = expandedPages[page.id] || false;
        const hasChildren = page.children.length > 0;
        const isHovered = hoveredPage === page.id;

        return (
          <div key={page.id} className="flex flex-col">
            <Item
              variant="default"
              size="sm"
              className="relative group hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-100"
              onMouseEnter={() => setHoveredPage(page.id)}
              onMouseLeave={() => setHoveredPage(null)}
            >
              <ItemHeader className="p-0">
                <div
                  className="flex items-center gap-2 flex-1 cursor-pointer"
                  onClick={() => toggleExpand(page.id)}
                >
                  {hasChildren ? (
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )
                  ) : (
                    <div className="w-4" />
                  )}
                  <ItemTitle className="text-sm font-normal">
                    {page.title || "Untitled Page"}
                  </ItemTitle>
                </div>

                {/* 悬停时显示的操作按钮 */}
                <ItemActions className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 添加子页面逻辑
                      console.log("Add child page", page.id);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 更多操作逻辑
                      console.log("More actions", page.id);
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </ItemActions>
              </ItemHeader>
            </Item>
            {hasChildren && isExpanded && (
              <div className="ml-4 border-l border-sidebar-border pl-2">
                <PageTree pages={page.children} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default function PageTreeComponent() {
  // 暂时使用静态数据，后续再集成trpc
  const pages = [
    {
      id: "1",
      title: "Document 1",
      isExpanded: false,
      children: [
        {
          id: "2",
          title: "Document 1.1",
          isExpanded: false,
          children: [],
          resources: [],
        },
        {
          id: "3",
          title: "Document 1.2",
          isExpanded: false,
          children: [
            {
              id: "4",
              title: "Document 1.2.1",
              isExpanded: false,
              children: [],
              resources: [],
            },
          ],
          resources: [],
        },
      ],
      resources: [],
    },
    {
      id: "5",
      title: "Document 2",
      isExpanded: false,
      children: [],
      resources: [],
    },
  ];

  return <PageTree pages={pages} />;
}
