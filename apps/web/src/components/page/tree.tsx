"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  FileText,
} from "lucide-react";
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
  icon: string | null;
  isExpanded: boolean;
  children: Page[];
  resources: any[];
}

// 递归渲染页面树
const PageTree = ({
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
  const [hoveredPage, setHoveredPage] = useState<string | null>(null);

  const toggleExpand = (pageId: string, currentIsExpanded: boolean) => {
    const newExpandedState = !currentIsExpanded;
    setExpandedPages((prev) => ({
      ...prev,
      [pageId]: newExpandedState,
    }));
    // 调用 trpc 接口更新数据库中的 isExpanded 状态
    updatePage.mutate({
      id: pageId,
      isExpanded: newExpandedState,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {pages.map((page) => {
        // 优先使用数据库中的 isExpanded 状态，其次使用本地状态
        const isExpanded = expandedPages[page.id] ?? page.isExpanded;
        const hasChildren = page.children.length > 0;
        const isHovered = hoveredPage === page.id;

        return (
          <div key={page.id} className="flex flex-col">
            <Item
              variant="default"
              size="sm"
              className="relative px-1 group hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-100 py-1"
              onMouseEnter={() => setHoveredPage(page.id)}
              onMouseLeave={() => setHoveredPage(null)}
            >
              <ItemHeader className="p-0">
                <div
                  className="flex items-center gap-0.5 flex-1 cursor-pointer"
                  onClick={() => toggleExpand(page.id, isExpanded)}
                >
                  <div className="w-4 flex items-center relative">
                    {/* 同时渲染两个元素，使用CSS过渡控制显示/隐藏 */}
                    <div
                      className={`absolute inset-0 flex items-center transition-all duration-200 ease-in-out ${
                        hasChildren && isHovered
                          ? "opacity-0 invisible"
                          : "opacity-100 visible"
                      }`}
                    >
                      {page.icon ? (
                        <span className="text-sm">{page.icon}</span>
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div
                      className={`absolute inset-0 flex items-center transition-all duration-200 ease-in-out ${
                        hasChildren && isHovered
                          ? "opacity-100 visible"
                          : "opacity-0 invisible"
                      }`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <ItemTitle className="text-sm font-normal">
                    {page.title || "Untitled Page"}
                  </ItemTitle>
                </div>

                {/* 悬停时显示的操作按钮 */}
                <ItemActions className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {/* <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 添加子页面逻辑
                      console.log("Add child page", page.id);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button> */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 更多操作逻辑
                      console.log("More actions", page.id);
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </ItemActions>
              </ItemHeader>
            </Item>
            {hasChildren && isExpanded && (
              <div className="ml-2 border-l border-sidebar-border pl-1">
                <PageTree
                  pages={page.children}
                  expandedPages={expandedPages}
                  setExpandedPages={setExpandedPages}
                  updatePage={updatePage}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default function PageTreeComponent() {
  // 使用 trpc 接口获取页面树数据
  const { data: pages = [] } = useQuery(trpc.page.getAll.queryOptions());

  // 将状态提升到顶层组件，确保整个页面树只有一个状态管理
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>(
    {}
  );

  // 使用 trpc 更新页面的 isExpanded 状态
  const updatePage = useMutation(trpc.page.update.mutationOptions());

  // 添加tree折叠状态
  const [isTreeExpanded, setIsTreeExpanded] = useState(true);

  return (
    <div>
      {/* 可折叠的tree标题栏 */}
      <div
        className="flex items-center justify-between p-2 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors duration-100 group"
        onClick={() => setIsTreeExpanded(!isTreeExpanded)}
      >
        <span className="text-xs text-muted-foreground">Pages</span>
        {isTreeExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-100" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-100" />
        )}
      </div>

      {/* 可折叠的tree内容，添加过渡动画 */}
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isTreeExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {isTreeExpanded && (
          <PageTree
            pages={pages}
            expandedPages={expandedPages}
            setExpandedPages={setExpandedPages}
            updatePage={updatePage}
          />
        )}
      </div>
    </div>
  );
}
