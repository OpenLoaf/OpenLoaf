import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useState } from "react";
import { useQuery, skipToken } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Skeleton } from "@/components/ui/skeleton";
import PlantIntro from "./PlantIntro";
import PlantCanvas from "./PlantCanvas";
import PlantTasks from "./PlantTasks";
import PlantMaterials from "./PlantMaterials";
import PlantSkills from "./PlantSkills";
import PlantTest from "./PlantTest";
import PlantTabs, { type PlantTabValue } from "./PlantTabs";

interface PlantPageProps {
  pageId?: string;
  [key: string]: any;
}

function PlantTitleSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-5 rounded-sm" />
      <Skeleton className="h-6 w-[35vw] max-w-[180px]" />
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

  const [activeTab, setActiveTab] = useState<PlantTabValue>("intro");

  const pageTitle = pageData?.title || "Plant Page";
  const titleIcon = pageData?.icon ?? undefined;

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      <div className="flex items-center justify-between py-0 w-full min-w-0">
        <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0 ml-2">
          {isLoading ? (
            <PlantTitleSkeleton />
          ) : (
            <>
              {titleIcon ? (
                <span className="flex items-center text-xl leading-none">
                  {titleIcon}
                </span>
              ) : null}
              <span className="truncate">{pageTitle}</span>
            </>
          )}
        </h1>

        <PlantTabs value={activeTab} onValueChange={setActiveTab} />
      </div>

      <ScrollArea.Root className="flex-1 min-h-0 w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 w-full">
            <div
              id={`plant-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`plant-tab-${activeTab}`}
              className="w-full h-full min-h-0"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  {activeTab === "intro" ? (
                    <PlantIntro isLoading={isLoading} pageTitle={pageTitle} />
                  ) : null}
                  {activeTab === "canvas" ? (
                    <PlantCanvas
                      isLoading={isLoading}
                      pageId={pageId}
                      pageTitle={pageTitle}
                    />
                  ) : null}
                  {activeTab === "tasks" ? (
                    <PlantTasks isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "materials" ? (
                    <PlantMaterials isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "skills" ? (
                    <PlantSkills isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "test" ? <PlantTest pageId={pageId} /> : null}
                </motion.div>
              </AnimatePresence>
            </div>
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
