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

  // 使用tRPC获取页面数据
  const { data: pageData, isLoading } = useQuery(
    trpc.page.findUniquePage.queryOptions(
      activeWorkspace && pageId ? { where: { id: pageId } } : skipToken
    )
  );

  // 添加当前页面到面包屑
  const breadcrumbItems = [
    {
      label: pageData?.title || activeTab?.title || "Plant Page",
      isCurrent: true,
    },
  ];

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
                  <BreadcrumbLink>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbItems.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-xl font-bold mb-4">
        {pageData?.title || (activeTab ? activeTab.title : "Plant Page")}
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
