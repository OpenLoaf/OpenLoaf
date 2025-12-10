import React from "react";
import { cn } from "@/lib/utils";
import * as ScrollArea from "@radix-ui/react-scroll-area";
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
      {/* 只有当面包屑有多于一条时才显示 */}
      {breadcrumbItems.length > 1 && (
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
      )}
      <h1 className="text-xl font-bold mb-4">
        {pageData?.title || (activeTab ? activeTab.title : "Plant Page")}
      </h1>
      <ScrollArea.Root className="h-full w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0">
          <div className="space-y-4">
            {isLoading ? (
              "Loading..."
            ) : pageData ? (
              `${pageData.title} - Plant Page Content`
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-2">测试滚动条长内容</h2>
                <p className="mb-4">
                  这是一段测试滚动条的长内容，用于验证滚动条功能是否正常工作。
                </p>
                <p className="mb-4">
                  当内容超出容器高度时，滚动条应该会出现，并且可以正常滚动查看所有内容。
                </p>
                <p className="mb-4">以下是重复的文本内容，用于增加页面高度：</p>
                <div className="space-y-2">
                  <p>测试内容行 1</p>
                  <p>测试内容行 2</p>
                  <p>测试内容行 3</p>
                  <p>测试内容行 4</p>
                  <p>测试内容行 5</p>
                  <p>测试内容行 6</p>
                  <p>测试内容行 7</p>
                  <p>测试内容行 8</p>
                  <p>测试内容行 9</p>
                  <p>测试内容行 10</p>
                  <p>测试内容行 11</p>
                  <p>测试内容行 12</p>
                  <p>测试内容行 13</p>
                  <p>测试内容行 14</p>
                  <p>测试内容行 15</p>
                  <p>测试内容行 16</p>
                  <p>测试内容行 17</p>
                  <p>测试内容行 18</p>
                  <p>测试内容行 19</p>
                  <p>测试内容行 20</p>
                  <p>测试内容行 21</p>
                  <p>测试内容行 22</p>
                  <p>测试内容行 23</p>
                  <p>测试内容行 24</p>
                  <p>测试内容行 25</p>
                  <p>测试内容行 26</p>
                  <p>测试内容行 27</p>
                  <p>测试内容行 28</p>
                  <p>测试内容行 29</p>
                  <p>测试内容行 30</p>
                  <p>测试内容行 31</p>
                  <p>测试内容行 32</p>
                  <p>测试内容行 33</p>
                  <p>测试内容行 34</p>
                  <p>测试内容行 35</p>
                  <p>测试内容行 36</p>
                  <p>测试内容行 37</p>
                  <p>测试内容行 38</p>
                  <p>测试内容行 39</p>
                  <p>测试内容行 40</p>
                  <p>测试内容行 41</p>
                  <p>测试内容行 42</p>
                  <p>测试内容行 43</p>
                  <p>测试内容行 44</p>
                  <p>测试内容行 45</p>
                  <p>测试内容行 46</p>
                  <p>测试内容行 47</p>
                  <p>测试内容行 48</p>
                  <p>测试内容行 49</p>
                  <p>测试内容行 50</p>
                </div>
                <p className="mt-4">滚动到底部了！滚动条功能正常。</p>
              </>
            )}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-7px" }}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </div>
  );
}
