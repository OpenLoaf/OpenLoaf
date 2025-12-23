"use client";

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useTabs } from "@/hooks/use-tabs";
import { usePage } from "@/hooks/use-page";
import ProjectInfo, { ProjectIntroHeader } from "./intro/ProjectIntro";
import ProjectCanvas, { ProjectCanvasHeader } from "./convas/ProjectCanvas";
import ProjectTasks, { ProjectTasksHeader } from "./ProjectTasks";
import ProjectMaterials, { ProjectMaterialsHeader } from "./ProjectMaterials";
import ProjectSkills, { ProjectSkillsHeader } from "./ProjectSkills";
import ProjectTabs, { type ProjectTabValue } from "./ProjectTabs";

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
  const mountedScopeRef = useRef<{ pageId?: string; tabId?: string }>({
    pageId,
    tabId,
  });
  const queryClient = useQueryClient();
  const pageSelect = useRef({ id: true, title: true, icon: true }).current;

  const {
    data: pageData,
    isLoading,
    invalidatePage,
    invalidatePageTree,
  } = usePage(pageId);

  const [activeTab, setActiveTab] = useState<ProjectTabValue>("intro");
  const [mountedTabs, setMountedTabs] = useState<Set<ProjectTabValue>>(
    () => new Set<ProjectTabValue>(["intro"])
  );
  const [introReadOnly, setIntroReadOnly] = useState(true);

  const pageTitle = pageData?.title || "Untitled Page";
  const titleIcon: string | undefined = pageData?.icon ?? undefined;
  const shouldRenderIntro = activeTab === "intro" || mountedTabs.has("intro");
  const shouldRenderCanvas = activeTab === "canvas" || mountedTabs.has("canvas");
  const shouldRenderTasks = activeTab === "tasks" || mountedTabs.has("tasks");
  const shouldRenderMaterials =
    activeTab === "materials" || mountedTabs.has("materials");
  const shouldRenderSkills = activeTab === "skills" || mountedTabs.has("skills");

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

  /** Update project title with optimistic cache. */
  const handleUpdateTitle = useCallback(
    (nextTitle: string) => {
      if (!pageId) return;
      updatePage.mutate({ where: { id: pageId }, data: { title: nextTitle } });
    },
    [pageId, updatePage]
  );

  /** Update project icon with optimistic cache. */
  const handleUpdateIcon = useCallback(
    (nextIcon: string) => {
      if (!pageId) return;
      updatePage.mutate({ where: { id: pageId }, data: { icon: nextIcon } });
    },
    [pageId, updatePage]
  );

  useEffect(() => {
    appliedWidthRef.current = false;
  }, [pageId, tabId]);

  // 页面切换时重置只读状态，避免沿用旧页面的编辑状态。
  useEffect(() => {
    setIntroReadOnly(true);
  }, [pageId]);

  // 面板首次访问后保留挂载状态，避免初始化时一次性渲染所有重组件。
  // 记录页面上下文变化，避免仅切换子 tab 时重置挂载缓存。
  /** Reset mounted panels when the page context changes. */
  useEffect(() => {
    const prevScope = mountedScopeRef.current;
    if (prevScope.pageId === pageId && prevScope.tabId === tabId) return;
    mountedScopeRef.current = { pageId, tabId };
    setMountedTabs(new Set<ProjectTabValue>([activeTab]));
  }, [pageId, tabId, activeTab]);

  /** Mark the active panel as mounted. */
  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    if (!tabActive) return;
    if (appliedWidthRef.current) return;
    if (!tabId) return;
    setTabLeftWidthPercent(tabId, 70);
    appliedWidthRef.current = true;
  }, [tabActive, tabId, setTabLeftWidthPercent]);

  // 面板按需挂载，header 常驻渲染并用 CSS 过渡控制显示与交互。
  const headerBaseClass =
    "absolute inset-0 flex items-center pl-2 transition-opacity duration-240 ease-out";
  const panelBaseClass =
    "absolute inset-0 box-border pt-0 transition-opacity duration-240 ease-out";

  /** Toggle read-only mode for the intro plate. */
  const handleSetIntroReadOnly = useCallback((nextReadOnly: boolean) => {
    setIntroReadOnly(nextReadOnly);
  }, []);

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      <div className="relative flex items-center py-0 w-full min-w-0 gap-3 pb-2">
        <div className="relative flex-1 min-w-0 min-h-[36px]">
          <div
            className={`${headerBaseClass} ${
              activeTab === "intro"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "intro"}
          >
            <ProjectIntroHeader
              isLoading={isLoading}
              pageId={pageId}
              pageTitle={pageTitle}
              titleIcon={titleIcon}
              currentTitle={pageData?.title ?? undefined}
              isUpdating={updatePage.isPending}
              onUpdateTitle={handleUpdateTitle}
              onUpdateIcon={handleUpdateIcon}
              isReadOnly={introReadOnly}
              onSetReadOnly={handleSetIntroReadOnly}
            />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "canvas"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "canvas"}
          >
            <ProjectCanvasHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "tasks"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "tasks"}
          >
            <ProjectTasksHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "materials"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "materials"}
          >
            <ProjectMaterialsHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "skills"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "skills"}
          >
            <ProjectSkillsHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
        </div>
        <div className="shrink-0">
          <ProjectTabs
            value={activeTab}
            onValueChange={(nextTab) => {
              startTransition(() => {
                setActiveTab(nextTab);
              });
            }}
            isActive={tabActive}
            revealDelayMs={800}
          />
        </div>
      </div>

      <ScrollArea.Root className="flex-1 min-h-0 w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0 min-w-0 flex flex-col [&>div]:!min-w-0 [&>div]:!w-full [&>div]:!h-full [&>div]:!block">
          <div className="flex-1 min-h-0 w-full h-full">
            <div className="relative w-full h-full min-h-0">
              <div
                id="project-panel-intro"
                role="tabpanel"
                aria-labelledby="project-tab-intro"
                className={`${panelBaseClass} ${
                  activeTab === "intro"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "intro"}
              >
                {shouldRenderIntro ? (
                  <ProjectInfo
                    isLoading={isLoading}
                    isActive={tabActive && activeTab === "intro"}
                    pageId={pageId}
                    pageTitle={pageTitle}
                    readOnly={introReadOnly}
                  />
                ) : null}
              </div>
              <div
                id="project-panel-canvas"
                role="tabpanel"
                aria-labelledby="project-tab-canvas"
                className={`${panelBaseClass} ${
                  activeTab === "canvas"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "canvas"}
              >
                {shouldRenderCanvas ? (
                  <ProjectCanvas
                    isLoading={isLoading}
                    isActive={tabActive && activeTab === "canvas"}
                    pageId={pageId}
                    pageTitle={pageTitle}
                  />
                ) : null}
              </div>
              <div
                id="project-panel-tasks"
                role="tabpanel"
                aria-labelledby="project-tab-tasks"
                className={`${panelBaseClass} ${
                  activeTab === "tasks"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "tasks"}
              >
                {shouldRenderTasks ? (
                  <ProjectTasks isLoading={isLoading} pageId={pageId} />
                ) : null}
              </div>
              <div
                id="project-panel-materials"
                role="tabpanel"
                aria-labelledby="project-tab-materials"
                className={`${panelBaseClass} ${
                  activeTab === "materials"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "materials"}
              >
                {shouldRenderMaterials ? (
                  <ProjectMaterials isLoading={isLoading} pageId={pageId} />
                ) : null}
              </div>
              <div
                id="project-panel-skills"
                role="tabpanel"
                aria-labelledby="project-tab-skills"
                className={`${panelBaseClass} ${
                  activeTab === "skills"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "skills"}
              >
                {shouldRenderSkills ? (
                  <ProjectSkills isLoading={isLoading} pageId={pageId} />
                ) : null}
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
