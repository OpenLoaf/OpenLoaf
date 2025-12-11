import React from "react";
import { cn } from "@/lib/utils";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useTabs } from "@/hooks/use_tabs";
import { useQuery, skipToken } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/hooks/use_workspace";
import PlantHeader from "./PlantHeader";

interface PlantPageProps {
  pageId?: string;
  [key: string]: any;
}

export default function PlantPage({ pageId }: PlantPageProps) {
  const { activeWorkspace } = useWorkspace();

  // 使用tRPC获取页面数据
  const { data: pageData, isLoading } = useQuery(
    trpc.page.findUniquePage.queryOptions(
      activeWorkspace && pageId ? { where: { id: pageId } } : skipToken
    )
  );

  return (
    <>
      <PlantHeader pageTitle={pageData?.title || "Plant Page"} />
      <h1 className="text-xl font-bold mb-4">
        {pageData?.title || "Plant Page"}
      </h1>
      <ScrollArea.Root className="h-full w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0">
          <div className="space-y-4">
            {isLoading
              ? "Loading..."
              : pageData
              ? `${pageData.title} - Plant Page Content`
              : "No page data available"}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-7px" }}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </>
  );
}
