import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useState } from "react";
import { useQuery, skipToken } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Skeleton } from "@/components/ui/skeleton";
import ProjectIntro from "./ProjectIntro";
import ProjectCanvas from "./ProjectCanvas";
import ProjectTasks from "./ProjectTasks";
import ProjectMaterials from "./ProjectMaterials";
import ProjectSkills from "./ProjectSkills";
import ProjectTest from "./ProjectTest";
import ProjectTabs, { type ProjectTabValue } from "./ProjectTabs";

interface ProjectPageProps {
  pageId?: string;
  [key: string]: any;
}

function ProjectTitleSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-5 rounded-sm" />
      <Skeleton className="h-6 w-[35vw] max-w-[180px]" />
    </div>
  );
}

export default function ProjectPage({ pageId }: ProjectPageProps) {
  const { workspace: activeWorkspace } = useWorkspace();

  // 使用tRPC获取页面数据
  const { data: pageData, isLoading } = useQuery(
    trpc.page.findUniquePage.queryOptions(
      activeWorkspace && pageId ? { where: { id: pageId } } : skipToken
    )
  );

  const [activeTab, setActiveTab] = useState<ProjectTabValue>("intro");

  const pageTitle = pageData?.title || "Project Page";
  const titleIcon = pageData?.icon ?? undefined;

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      <div className="flex items-center justify-between py-0 w-full min-w-0">
        <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0 ml-2">
          {isLoading ? (
            <ProjectTitleSkeleton />
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

        <ProjectTabs value={activeTab} onValueChange={setActiveTab} />
      </div>

      <ScrollArea.Root className="flex-1 min-h-0 w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 w-full">
            <div
              id={`project-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`project-tab-${activeTab}`}
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
                    <ProjectIntro isLoading={isLoading} pageTitle={pageTitle} />
                  ) : null}
                  {activeTab === "canvas" ? (
                    <ProjectCanvas
                      isLoading={isLoading}
                      pageId={pageId}
                      pageTitle={pageTitle}
                    />
                  ) : null}
                  {activeTab === "tasks" ? (
                    <ProjectTasks isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "materials" ? (
                    <ProjectMaterials isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "skills" ? (
                    <ProjectSkills isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "test" ? (
                    <ProjectTest pageId={pageId} />
                  ) : null}
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
