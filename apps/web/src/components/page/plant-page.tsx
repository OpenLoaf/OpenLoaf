import React from "react";
import { useTabs } from "@/hooks/use_tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useQuery, skipToken } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/hooks/use_workspace";

interface PlantPageProps {
  pageId?: string;
  [key: string]: any;
}

export default function PlantPage({ pageId }: PlantPageProps) {
  const { activeTabId, getTabById } = useTabs();
  const activeTab = activeTabId ? getTabById(activeTabId) : undefined;
  const { activeWorkspace } = useWorkspace();

  // 使用tRPC获取页面数据，包括parentPages
  const { data: pageData, isLoading } = useQuery(
    trpc.page.getById.queryOptions(
      activeWorkspace && pageId
        ? { id: pageId, workspaceId: activeWorkspace.id }
        : skipToken
    )
  );

  // 动态生成面包屑项，仅包含页面层级
  const breadcrumbItems = [];

  // 添加所有上级页面
  if (pageData?.parentPages) {
    pageData.parentPages.forEach((parentPage: any) => {
      breadcrumbItems.push({
        label: parentPage.title || "Untitled Page",
        href: `/page/${parentPage.id}`,
      });
    });
  }

  // 添加当前页面
  breadcrumbItems.push({
    label: pageData?.title || activeTab?.title || "Plant Page",
    isCurrent: true,
  });

  return (
    <div className="main-content h-full p-4 bg-background  rounded-lg">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          {breadcrumbItems.map((item, index) => (
            <React.Fragment key={index}>
              <BreadcrumbItem>
                {item.isCurrent ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbItems.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-xl font-bold mb-4">
        {pageData?.title || activeTab ? activeTab.title : "Plant Page"}
      </h1>
      <div className="h-[calc(100%-2rem)] rounded  p-4">
        {isLoading
          ? "Loading..."
          : pageData
          ? `${pageData.title} - Plant Page Content`
          : "Plant Page placeholder"}
      </div>
    </div>
  );
}
