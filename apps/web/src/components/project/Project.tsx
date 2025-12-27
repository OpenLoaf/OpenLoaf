"use client";

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useTabs } from "@/hooks/use-tabs";
import { usePage } from "@/hooks/use-page";
import ProjectInfo, { ProjectIntroHeader } from "./intro/ProjectIntro";
import ProjectCanvasHeader from "./convas/ProjectCanvasHeader";
import { ProjectBoardCanvas } from "@teatime-ai/board";
import ProjectTasks, { ProjectTasksHeader } from "./ProjectTasks";
import ProjectMaterials, { ProjectMaterialsHeader } from "./ProjectMaterials";
import ProjectSkills, { ProjectSkillsHeader } from "./ProjectSkills";
import ProjectTabs, { PROJECT_TABS, type ProjectTabValue } from "./ProjectTabs";

interface ProjectPageProps {
  tabId?: string;
  pageId?: string;
  projectTab?: ProjectTabValue;
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

/** Returns true when the event target is an editable element. */
function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.getAttribute("role") === "textbox"
  );
}

/** Returns the project tab value for a numeric shortcut index. */
function getProjectTabByIndex(index: number) {
  return PROJECT_TABS[index]?.value;
}

export default function ProjectPage({ pageId, tabId, projectTab }: ProjectPageProps) {
  const { workspace: activeWorkspace } = useWorkspace();
  const tabActive = useTabActive();
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const setTabBaseParams = useTabs((s) => s.setTabBaseParams);
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

  // 从持久化参数恢复上次的 Project 子标签，刷新后保持位置。
  const initialProjectTab =
    projectTab && PROJECT_TABS.some((tab) => tab.value === projectTab)
      ? projectTab
      : "intro";
  const [activeTab, setActiveTab] = useState<ProjectTabValue>(initialProjectTab);
  const [mountedTabs, setMountedTabs] = useState<Set<ProjectTabValue>>(
    () => new Set<ProjectTabValue>([initialProjectTab])
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

  useEffect(() => {
    if (!projectTab) return;
    if (!PROJECT_TABS.some((tab) => tab.value === projectTab)) return;
    if (projectTab === activeTab) return;
    // 恢复持久化的子标签，避免 F5 后回到默认页。
    setActiveTab(projectTab);
  }, [projectTab, activeTab]);

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
    setTabLeftWidthPercent(tabId, 90);
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

  /** Persist the active project tab into the dock base params. */
  const handleProjectTabChange = useCallback(
    (nextTab: ProjectTabValue) => {
      startTransition(() => {
        setActiveTab(nextTab);
      });
      if (!tabId) return;
      // 同步写入 base.params，刷新后保持位置。
      setTabBaseParams(tabId, { projectTab: nextTab });
    },
    [setTabBaseParams, tabId]
  );

  // 项目快捷键流程：只有当前 tab 处于激活态才拦截按键；
  // 避免在输入框中打断编辑；识别 Alt + 数字并切换到对应子标签，同时保持参数持久化。
  const handleProjectTabShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (!tabActive) return;
      if (event.defaultPrevented) return;
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key;
      if (key.length !== 1 || key < "1" || key > "9") return;

      const nextTab = getProjectTabByIndex(Number.parseInt(key, 10) - 1);
      if (!nextTab) return;

      event.preventDefault();
      handleProjectTabChange(nextTab);
    },
    [handleProjectTabChange, tabActive]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleProjectTabShortcut);
    return () => {
      window.removeEventListener("keydown", handleProjectTabShortcut);
    };
  }, [handleProjectTabShortcut]);

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
            onValueChange={handleProjectTabChange}
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
                  <ProjectBoardCanvas
                    isLoading={isLoading}
                    isActive={tabActive && activeTab === "canvas"}
                    trpc={trpcClient}
                    workspaceId={activeWorkspace?.id}
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
