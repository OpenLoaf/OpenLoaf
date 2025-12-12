import React from "react";
import { cn } from "@/lib/utils";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useTabs } from "@/hooks/use_tabs";
import { useQuery, skipToken } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/app/page";
import { Skeleton } from "@/components/ui/skeleton";
import PlantHeader from "./PlantHeader";

interface PlantPageProps {
  pageId?: string;
  [key: string]: any;
}

function PlantContentSkeleton() {
  return (
    <div className="space-y-4 mt-3">
      <Skeleton className="h-24 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[72%]" />
        <Skeleton className="h-4 w-[56%]" />
        <Skeleton className="h-4 w-[64%]" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function PlantHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between py-0 w-full">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-sm" />
        <Skeleton className="h-6 w-[35vw] max-w-[180px]" />
      </div>
      <div className="flex justify-end flex-1 min-w-0">
        <Skeleton className="h-9 w-full max-w-[360px] rounded-md" />
      </div>
    </div>
  );
}

export default function PlantPage({ pageId }: PlantPageProps) {
  const { workspace: activeWorkspace } = useWorkspace();

  // 使用tRPC获取页面数据
  const { data: pageData, isLoading } = useQuery(
    trpc.page.findUniquePage.queryOptions(
      activeWorkspace && pageId ? { where: { id: pageId } } : skipToken
    )
  );

  return (
    <>
      {isLoading ? (
        <PlantHeaderSkeleton />
      ) : (
        <PlantHeader
          pageTitle={pageData?.title || "Plant Page"}
          titleIcon={pageData?.icon ?? undefined}
        />
      )}
      <ScrollArea.Root className="h-full w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0">
          <div className="space-y-4">
            {isLoading ? (
              <PlantContentSkeleton />
            ) : pageData ? (
              `${pageData.title} - Plant Page Content`
            ) : (
              "No page data available"
            )}
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
