"use client";

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useTabs } from "@/hooks/use-tabs";
import { usePage } from "@/hooks/use-page";
import ProjectInfo from "./intro/ProjectIntro";
import ProjectCanvas from "./ProjectCanvas";
import ProjectTasks from "./ProjectTasks";
import ProjectMaterials from "./ProjectMaterials";
import ProjectSkills from "./ProjectSkills";
import ProjectTest from "./ProjectTest";
import ProjectTabs, { type ProjectTabValue } from "./ProjectTabs";
import ProjectTitle from "./ProjectTitle";

interface ProjectPageProps {
  tabId?: string;
  pageId?: string;
  [key: string]: any;
}

function updateTreeNode(pages: any[], pageId: string, patch: any) {
  let changed = false;
  const nextPages = pages.map((page) => {
    const next: any = { ...page };
    if (next.id === pageId) {
      for (const [key, value] of Object.entries(patch)) {
        if (next[key] !== value) changed = true;
        next[key] = value;
      }
    }
    if (Array.isArray(next.children) && next.children.length > 0) {
      const nextChildren = updateTreeNode(next.children, pageId, patch);
      if (nextChildren !== next.children) {
        changed = true;
        next.children = nextChildren;
      }
    }
    return next;
  });
  return changed ? nextPages : pages;
}

export default function ProjectPage({ pageId, tabId }: ProjectPageProps) {
  const { workspace: activeWorkspace } = useWorkspace();
  const tabActive = useTabActive();
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const appliedWidthRef = useRef(false);
  const queryClient = useQueryClient();
  const pageSelect = useRef({ id: true, title: true, icon: true }).current;

  const {
    data: pageData,
    isLoading,
    invalidatePage,
    invalidatePageTree,
  } = usePage(pageId);

  const [activeTab, setActiveTab] = useState<ProjectTabValue>("intro");

  const pageTitle = pageData?.title || "Untitled Page";
  const titleIcon: string | undefined = pageData?.icon ?? undefined;

  const pageQueryKey =
    activeWorkspace && pageId
      ? trpc.page.findUniquePage.queryOptions({
          where: { id: pageId },
          select: pageSelect,
        }).queryKey
      : undefined;
  const pageTreeQueryKey = activeWorkspace?.id
    ? trpc.pageCustom.getAll.queryOptions({ workspaceId: activeWorkspace.id })
        .queryKey
    : undefined;

  const updatePage = useMutation(
    trpc.page.updateOnePage.mutationOptions({
      onMutate: async (variables: any) => {
        const patch: any = {};
        if (variables?.data?.icon !== undefined)
          patch.icon = variables.data.icon;
        if (variables?.data?.title !== undefined)
          patch.title = variables.data.title;
        if (!pageId || Object.keys(patch).length === 0) return;

        const previousPage = pageQueryKey
          ? queryClient.getQueryData(pageQueryKey)
          : undefined;
        const previousPageTree = pageTreeQueryKey
          ? queryClient.getQueryData(pageTreeQueryKey)
          : undefined;

        if (pageQueryKey) {
          queryClient.setQueryData(pageQueryKey, (oldData: any) => {
            if (!oldData) return oldData;
            return { ...oldData, ...patch };
          });
        }

        if (pageTreeQueryKey) {
          queryClient.setQueryData(pageTreeQueryKey, (oldData: any) => {
            if (!Array.isArray(oldData)) return oldData;
            return updateTreeNode(oldData, pageId, patch);
          });
        }

        return { previousPage, previousPageTree };
      },
      onError: (_error, _variables, context) => {
        if (pageQueryKey && context?.previousPage !== undefined) {
          queryClient.setQueryData(pageQueryKey, context.previousPage);
        }
        if (pageTreeQueryKey && context?.previousPageTree !== undefined) {
          queryClient.setQueryData(pageTreeQueryKey, context.previousPageTree);
        }
      },
      onSettled: async () => {
        await invalidatePage();
        await invalidatePageTree();
      },
    })
  );

  useEffect(() => {
    appliedWidthRef.current = false;
  }, [pageId, tabId]);

  useEffect(() => {
    if (!tabActive) return;
    if (appliedWidthRef.current) return;
    if (!tabId) return;
    setTabLeftWidthPercent(tabId, 70);
    appliedWidthRef.current = true;
  }, [tabActive, tabId, setTabLeftWidthPercent]);

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      <div className="relative flex items-center py-0 w-full min-w-0">
        {/* <ProjectTitle
          isLoading={isLoading}
          pageId={pageId}
          pageTitle={pageTitle}
          titleIcon={titleIcon}
          currentTitle={pageData?.title ?? undefined}
          isUpdating={updatePage.isPending}
          onUpdateTitle={(nextTitle) => {
            if (!pageId) return;
            updatePage.mutate({ where: { id: pageId }, data: { title: nextTitle } });
          }}
          onUpdateIcon={(nextIcon) => {
            if (!pageId) return;
            updatePage.mutate({ where: { id: pageId }, data: { icon: nextIcon } });
          }}
        /> */}
        <ProjectTabs
          value={activeTab}
          onValueChange={setActiveTab}
          isActive={tabActive}
          revealDelayMs={800}
        />{" "}
      </div>

      <ScrollArea.Root className="flex-1 min-h-0 w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0 min-w-0 flex flex-col [&>div]:!min-w-0 [&>div]:!w-full [&>div]:!h-full [&>div]:!block">
          <div className="flex-1 min-h-0 w-full h-full">
            <div
              id={`project-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`project-tab-${activeTab}`}
              className="w-full h-full min-h-0 flex flex-col"
            >
              <div className="w-full h-full min-h-0 flex-1 relative">
                <motion.div
                  className="absolute inset-0 w-full h-full"
                  animate={
                    activeTab === "intro"
                      ? { opacity: 1, y: 0, pointerEvents: "auto" }
                      : { opacity: 0, y: 8, pointerEvents: "none" }
                  }
                  transition={{ duration: 0.2 }}
                  aria-hidden={activeTab !== "intro"}
                >
                  <ProjectInfo
                    isLoading={isLoading}
                    pageId={pageId}
                    pageTitle={pageTitle}
                  />
                </motion.div>
                <motion.div
                  className="absolute inset-0 w-full h-full"
                  animate={
                    activeTab === "canvas"
                      ? { opacity: 1, y: 0, pointerEvents: "auto" }
                      : { opacity: 0, y: 8, pointerEvents: "none" }
                  }
                  transition={{ duration: 0.2 }}
                  aria-hidden={activeTab !== "canvas"}
                >
                  <ProjectCanvas
                    isLoading={isLoading}
                    pageId={pageId}
                    pageTitle={pageTitle}
                  />
                </motion.div>
                <motion.div
                  className="absolute inset-0 w-full h-full"
                  animate={
                    activeTab === "tasks"
                      ? { opacity: 1, y: 0, pointerEvents: "auto" }
                      : { opacity: 0, y: 8, pointerEvents: "none" }
                  }
                  transition={{ duration: 0.2 }}
                  aria-hidden={activeTab !== "tasks"}
                >
                  <ProjectTasks isLoading={isLoading} pageId={pageId} />
                </motion.div>
                <motion.div
                  className="absolute inset-0 w-full h-full"
                  animate={
                    activeTab === "materials"
                      ? { opacity: 1, y: 0, pointerEvents: "auto" }
                      : { opacity: 0, y: 8, pointerEvents: "none" }
                  }
                  transition={{ duration: 0.2 }}
                  aria-hidden={activeTab !== "materials"}
                >
                  <ProjectMaterials isLoading={isLoading} pageId={pageId} />
                </motion.div>
                <motion.div
                  className="absolute inset-0 w-full h-full"
                  animate={
                    activeTab === "skills"
                      ? { opacity: 1, y: 0, pointerEvents: "auto" }
                      : { opacity: 0, y: 8, pointerEvents: "none" }
                  }
                  transition={{ duration: 0.2 }}
                  aria-hidden={activeTab !== "skills"}
                >
                  <ProjectSkills isLoading={isLoading} pageId={pageId} />
                </motion.div>
                <motion.div
                  className="absolute inset-0 w-full h-full"
                  animate={
                    activeTab === "test"
                      ? { opacity: 1, y: 0, pointerEvents: "auto" }
                      : { opacity: 0, y: 8, pointerEvents: "none" }
                  }
                  transition={{ duration: 0.2 }}
                  aria-hidden={activeTab !== "test"}
                >
                  <ProjectTest pageId={pageId} />
                </motion.div>
              </div>
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
