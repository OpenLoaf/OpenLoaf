/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useAppState } from "@/hooks/use-app-state";
import { useProject } from "@/hooks/use-project";
import { useProjects } from "@/hooks/use-projects";
import { createPortal } from "react-dom";
import { useHeaderSlot } from "@/hooks/use-header-slot";
import ProjectIndex from "./index/ProjectIndex";
import ProjectHistory from "./history/ProjectHistoryPage";
import ProjectTabs, { PROJECT_TABS, type ProjectTabValue } from "./ProjectTabs";
import ProjectFileSystem, {
  type ProjectBreadcrumbInfo,
} from "./filesystem/components/ProjectFileSystem";
import ProjectScheduledTasksPage from "./tasks/ProjectScheduledTasksPage";
import { lazy, Suspense } from "react";
import { useGlobalOverlay } from "@/lib/globalShortcuts";

const LazyCanvasListPage = lazy(() => import("@/components/board/CanvasListPage"));

interface ProjectPageProps {
  tabId?: string;
  projectId?: string;
  rootUri?: string;
  projectTab?: ProjectTabValue;
  fileUri?: string | null;
  [key: string]: any;
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

type ProjectTreeNode = {
  /** Project id. */
  projectId: string;
  /** Project root uri. */
  rootUri: string;
  /** Project display title. */
  title: string;
  /** Project icon. */
  icon?: string;
  /** Whether the project root belongs to a git repository. */
  isGitProject?: boolean;
  /** Child projects. */
  children?: ProjectTreeNode[];
};

/** Flatten project tree into a lookup map. */
function buildProjectLookup(projects: ProjectTreeNode[] | undefined) {
  const map = new Map<string, ProjectBreadcrumbInfo>();
  const walk = (nodes: ProjectTreeNode[]) => {
    nodes.forEach((node) => {
      map.set(node.rootUri, { title: node.title, icon: node.icon ?? undefined });
      if (node.children?.length) {
        walk(node.children);
      }
    });
  };
  if (projects?.length) {
    walk(projects);
  }
  return map;
}

/** Find a project node by project id or root uri. */
function findProjectNode(
  projects: ProjectTreeNode[] | undefined,
  target: { projectId?: string; rootUri?: string }
): ProjectTreeNode | null {
  if (!projects?.length) return null;
  const targetId = target.projectId?.trim();
  const targetRoot = target.rootUri?.trim();
  const matchNode = (node: ProjectTreeNode) => {
    if (targetId && node.projectId === targetId) return true;
    if (targetRoot && node.rootUri === targetRoot) return true;
    return false;
  };
  // 逻辑：优先按 projectId 命中，未命中再按 rootUri 回退。
  const walk = (nodes: ProjectTreeNode[]): ProjectTreeNode | null => {
    for (const node of nodes) {
      if (matchNode(node)) return node;
      if (node.children?.length) {
        const hit = walk(node.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(projects);
}

/** Find project depth (root level starts from 1) by project id or root uri. */
function findProjectDepth(
  projects: ProjectTreeNode[] | undefined,
  target: { projectId?: string; rootUri?: string }
): number | null {
  if (!projects?.length) return null;
  const targetId = target.projectId?.trim();
  const targetRoot = target.rootUri?.trim();
  const matchNode = (node: ProjectTreeNode) => {
    if (targetId && node.projectId === targetId) return true;
    if (targetRoot && node.rootUri === targetRoot) return true;
    return false;
  };
  const walk = (nodes: ProjectTreeNode[], depth: number): number | null => {
    for (const node of nodes) {
      if (matchNode(node)) return depth;
      if (node.children?.length) {
        const hit = walk(node.children, depth + 1);
        if (hit !== null) return hit;
      }
    }
    return null;
  };
  return walk(projects, 1);
}

export default function ProjectPage({
  projectId,
  rootUri,
  tabId,
  projectTab,
  fileUri: externalFileUri,
}: ProjectPageProps) {
  const tabActive = useTabActive();
  const setLeftWidthPercent = useLayoutState((s) => s.setLeftWidthPercent);
  const setBaseParams = useLayoutState((s) => s.setBaseParams);
  const setTitle = useAppView((s) => s.setTitle);
  const setIcon = useAppView((s) => s.setIcon);
  const tabView = useAppState();
  const appliedWidthRef = useRef(false);
  const mountedScopeRef = useRef<{ rootUri?: string; tabId?: string }>({
    rootUri,
    tabId,
  });

  const {
    data: projectData,
    isLoading,
    isError,
    invalidateProject,
    invalidateProjectList,
  } = useProject(projectId);
  // 项目已被删除或不存在时导航回默认视图，避免子组件持续发起无效请求。
  useEffect(() => {
    if (!projectId) return;
    if (isLoading) return;
    if (isError) {
      useAppView.getState().navigate({});
    }
  }, [projectId, isLoading, isError]);

  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const [localIcon, setLocalIcon] = useState<string | null>(null);
  const lastTitleRef = useRef<string | null>(null);
  const lastIconRef = useRef<string | null>(null);

  // 从持久化参数恢复上次的 Project 子标签，刷新后保持位置。
  const initialProjectTab =
    projectTab && PROJECT_TABS.some((tab) => tab.value === projectTab)
      ? projectTab
      : "index";
  const [activeTab, setActiveTab] = useState<ProjectTabValue>(initialProjectTab);
  const [mountedTabs, setMountedTabs] = useState<Set<ProjectTabValue>>(
    () => new Set<ProjectTabValue>([initialProjectTab])
  );
  /** Homepage read-only state. */
  const [indexReadOnly, setIndexReadOnly] = useState(true);
  /** Homepage desktop edit mode state. */
  const [indexEditMode, setIndexEditMode] = useState(false);
  /** Homepage dirty state. */
  const [indexDirty, setIndexDirty] = useState(false);
  const headerTitleExtraTarget = useHeaderSlot((s) => s.headerTitleExtraTarget);
  const [fileUri, setFileUri] = useState<string | null>(rootUri ?? null);

  const pageTitle =
    localTitle ??
    projectData?.project?.title ??
    tabView?.projectShell?.title ??
    "Untitled Project";
  const titleIcon: string | undefined =
    localIcon ?? projectData?.project?.icon ?? tabView?.projectShell?.icon ?? undefined;
  const isProjectShellMode = Boolean(tabView?.projectShell);
  // 逻辑：项目数据未加载前不覆盖持久化标题/图标，避免切换时闪动。
  const shouldSyncTabMeta = localTitle !== null || localIcon !== null || Boolean(projectData?.project);
  const shouldRenderIndex = activeTab === "index" || mountedTabs.has("index");
  const shouldRenderFiles = activeTab === "files" || mountedTabs.has("files");
  const shouldRenderTasks = activeTab === "tasks" || mountedTabs.has("tasks");
  const shouldRenderScheduled = activeTab === "scheduled" || mountedTabs.has("scheduled");
  const shouldRenderCanvas = activeTab === "canvas" || mountedTabs.has("canvas");
  // settings 已改为 dialog 模式，不再需要 tab panel 渲染。

  const updateProject = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: async () => {
        await invalidateProject();
        await invalidateProjectList();
      },
    })
  );

  /** Update project title with optimistic cache. */
  const handleUpdateTitle = useCallback(
    (nextTitle: string) => {
      if (!projectId) return;
      const fallbackTitle = projectData?.project?.title ?? "Untitled Project";
      const previousTitle = localTitle ?? fallbackTitle;
      lastTitleRef.current = previousTitle;
      setLocalTitle(nextTitle);
      updateProject.mutate(
        { projectId, title: nextTitle },
        {
          onError: () => {
            setLocalTitle(lastTitleRef.current ?? fallbackTitle);
          },
        }
      );
    },
    [projectId, projectData?.project?.title, localTitle, updateProject]
  );

  /** Update project icon with optimistic cache. */
  const handleUpdateIcon = useCallback(
    (nextIcon: string) => {
      if (!projectId) return;
      const fallbackIcon = projectData?.project?.icon ?? null;
      const previousIcon = localIcon ?? fallbackIcon;
      lastIconRef.current = previousIcon;
      setLocalIcon(nextIcon);
      updateProject.mutate(
        { projectId, icon: nextIcon },
        {
          onError: () => {
            setLocalIcon(lastIconRef.current ?? fallbackIcon);
          },
        }
      );
    },
    [projectId, projectData?.project?.icon, localIcon, updateProject]
  );

  useEffect(() => {
    appliedWidthRef.current = false;
  }, [projectId, rootUri, tabId]);

  useEffect(() => {
    if (!projectData?.project) return;
    setLocalTitle(projectData.project.title ?? null);
    setLocalIcon(projectData.project.icon ?? null);
  }, [projectData?.project]);

  useEffect(() => {
    if (!shouldSyncTabMeta) return;
    setTitle(pageTitle);
    setIcon(titleIcon);
  }, [pageTitle, setTitle, setIcon, shouldSyncTabMeta, titleIcon]);

  // 页面切换时重置只读状态，避免沿用旧页面的编辑状态。
  useEffect(() => {
    setIndexReadOnly(true);
    setIndexDirty(false);
  }, [projectId, rootUri]);

  useEffect(() => {
    setFileUri(rootUri ?? null);
  }, [rootUri]);

  const projectListQuery = useProjects();
  const projectLookup = useMemo(
    () => buildProjectLookup(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );
  const currentProjectNode = useMemo(
    () =>
      findProjectNode(projectListQuery.data as ProjectTreeNode[] | undefined, {
        projectId,
        rootUri,
      }),
    [projectListQuery.data, projectId, rootUri]
  );
  const currentProjectDepth = useMemo(
    () =>
      findProjectDepth(projectListQuery.data as ProjectTreeNode[] | undefined, {
        projectId,
        rootUri,
      }),
    [projectListQuery.data, projectId, rootUri]
  );
  const canConvertToSubproject = useMemo(
    // 逻辑：第三层及以下项目不再展示“转换为子项目”入口。
    () => (currentProjectDepth ?? 1) < 3,
    [currentProjectDepth]
  );
  const isGitProject = currentProjectNode?.isGitProject;

  useEffect(() => {
    if (!projectTab) return;
    if (!PROJECT_TABS.some((tab) => tab.value === projectTab)) return;
    if (projectTab === activeTab) return;
    // 恢复持久化的子标签，避免 F5 后回到默认页。
    setActiveTab(projectTab);
  }, [projectTab, activeTab]);

  useEffect(() => {
    // 逻辑：外部指定 fileUri 时同步到文件系统当前位置。
    if (!externalFileUri) return;
    setFileUri(externalFileUri);
  }, [externalFileUri]);

  // 面板首次访问后保留挂载状态，避免初始化时一次性渲染所有重组件。
  // 记录页面上下文变化，避免仅切换子 tab 时重置挂载缓存。
  /** Reset mounted panels when the page context changes. */
  useEffect(() => {
    const prevScope = mountedScopeRef.current;
    if (prevScope.rootUri === rootUri && prevScope.tabId === tabId) return;
    mountedScopeRef.current = { rootUri, tabId };
    setMountedTabs(new Set<ProjectTabValue>([activeTab]));
  }, [rootUri, tabId, activeTab]);

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
    setLeftWidthPercent(90);
    appliedWidthRef.current = true;
  }, [tabActive, tabId, setLeftWidthPercent]);

  const panelBaseClass =
    "absolute inset-0 box-border pt-0 transform-gpu transition-[opacity,transform] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform]";
  const showIndexTitleExtra = tabActive && activeTab === "index";
  const showFilesTitleExtra = tabActive && activeTab === "files";

  /** Toggle read-only mode for the homepage editor. */
  const handleSetIndexReadOnly = useCallback(
    (nextReadOnly: boolean) => {
      if (!indexReadOnly && nextReadOnly && indexDirty) {
        // 中文注释：未发布内容需要确认后才能退出编辑。
        const ok = window.confirm("当前有未保存内容，确定退出编辑并放弃修改？");
        if (!ok) return;
      }
      setIndexReadOnly(nextReadOnly);
    },
    [indexReadOnly, indexDirty]
  );

  /** Handle homepage publish completion. */
  const handleIndexPublish = useCallback(() => {
    setIndexReadOnly(true);
    setIndexDirty(false);
  }, []);

  /** Persist the active project tab into the dock base params. */
  const handleProjectTabChange = useCallback(
    (nextTab: ProjectTabValue) => {
      if (nextTab === "settings") {
        useGlobalOverlay.getState().setProjectSettingsOpen(true, projectId, rootUri);
        return;
      }
      startTransition(() => {
        setActiveTab(nextTab);
      });
      if (!tabId) return;
      setBaseParams({ projectTab: nextTab });
    },
    [setBaseParams, tabId, projectId, rootUri]
  );

  // 项目快捷键流程：只有当前 tab 处于激活态才拦截按键；
  // 避免在输入框中打断编辑；识别 Alt + 数字并切换到对应子标签，同时保持参数持久化。
  const handleProjectTabShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (!tabActive) return;
      if (event.defaultPrevented) return;
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const match = event.code.match(/^Digit(\d)$/);
      if (!match) return;

      const nextTab = getProjectTabByIndex(Number.parseInt(match[1], 10) - 1);
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
    <div className="project-shell flex h-full w-full flex-col min-h-0">
      {showIndexTitleExtra && headerTitleExtraTarget
        ? createPortal(
            <div className="flex items-center gap-1.5 text-sm text-foreground/50">
              <div className="mx-1 h-5 w-px bg-foreground/20" />
              <span className="font-medium text-foreground/80">首页</span>
            </div>,
            headerTitleExtraTarget,
          )
        : null}
      {showFilesTitleExtra && headerTitleExtraTarget
        ? createPortal(
            <div className="flex items-center gap-1.5 text-sm text-foreground/50">
              <div className="mx-1 h-5 w-px bg-foreground/20" />
              <span className="font-medium text-foreground/80">文件</span>
            </div>,
            headerTitleExtraTarget,
          )
        : null}

      <div className="relative flex-1 min-h-0 w-full">
        {!isProjectShellMode ? (
          <ProjectTabs
            value={activeTab}
            onValueChange={handleProjectTabChange}
            isActive={tabActive}
            revealDelayMs={200}
            size="md"
            tabId={tabId}
          />
        ) : null}
        <div
          className={`h-full w-full overflow-auto show-scrollbar ${
            activeTab === "index" ? "pb-2" : "pb-16"
          }`}
        >
          <div className="w-full h-full min-h-0 min-w-0 flex flex-col [&>div]:!min-w-0 [&>div]:!w-full [&>div]:!h-full [&>div]:!block">
            <div className="flex-1 min-h-0 w-full h-full">
              <div className="relative w-full h-full min-h-0 overflow-hidden rounded-lg bg-background">
                <div
                  id="project-panel-index"
                  role="tabpanel"
                  aria-labelledby="project-tab-index"
                  className={`${panelBaseClass} ${
                    activeTab === "index"
                      ? "opacity-100 pointer-events-auto translate-y-0 scale-100"
                      : "opacity-0 pointer-events-none translate-y-0.5 scale-[0.995]"
                  }`}
                  aria-hidden={activeTab !== "index"}
                >
                  {shouldRenderIndex ? (
                    <ProjectIndex
                      isLoading={isLoading}
                      isActive={tabActive && activeTab === "index"}
                      projectId={projectId}
                      rootUri={rootUri}
                      projectTitle={pageTitle}
                      readOnly={indexReadOnly}
                      onDirtyChange={setIndexDirty}
                      onPublishSuccess={handleIndexPublish}
                      onEditModeChange={setIndexEditMode}
                    />
                  ) : null}
                </div>
                <div
                  id="project-panel-files"
                  role="tabpanel"
                  aria-labelledby="project-tab-files"
                  className={`${panelBaseClass} ${
                    activeTab === "files"
                      ? "opacity-100 pointer-events-auto translate-y-0 scale-100"
                      : "opacity-0 pointer-events-none translate-y-0.5 scale-[0.995]"
                  }`}
                  aria-hidden={activeTab !== "files"}
                >
                  {shouldRenderFiles ? (
                    <ProjectFileSystem
                      projectId={projectId}
                      rootUri={rootUri}
                      currentUri={fileUri}
                      isLoading={isLoading}
                      isActive={tabActive && activeTab === "files"}
                      isGitProject={isGitProject}
                      canConvertToSubproject={canConvertToSubproject}
                      projectLookup={projectLookup}
                      onNavigate={setFileUri}
                    />
                  ) : null}
                </div>
                <div
                  id="project-panel-tasks"
                  role="tabpanel"
                  aria-labelledby="project-tab-tasks"
                  className={`${panelBaseClass} ${
                    activeTab === "tasks"
                      ? "opacity-100 pointer-events-auto translate-y-0 scale-100"
                      : "opacity-0 pointer-events-none translate-y-0.5 scale-[0.995]"
                  }`}
                  aria-hidden={activeTab !== "tasks"}
                >
                  {shouldRenderTasks ? (
                    <ProjectHistory isLoading={isLoading} />
                  ) : null}
                </div>
                <div
                  id="project-panel-scheduled"
                  role="tabpanel"
                  aria-labelledby="project-tab-scheduled"
                  className={`${panelBaseClass} ${
                    activeTab === "scheduled"
                      ? "opacity-100 pointer-events-auto translate-y-0 scale-100"
                      : "opacity-0 pointer-events-none translate-y-0.5 scale-[0.995]"
                  }`}
                  aria-hidden={activeTab !== "scheduled"}
                >
                  {shouldRenderScheduled ? (
                    <ProjectScheduledTasksPage projectId={projectId} />
                  ) : null}
                </div>
                <div
                  id="project-panel-canvas"
                  role="tabpanel"
                  aria-labelledby="project-tab-canvas"
                  className={`${panelBaseClass} ${
                    activeTab === "canvas"
                      ? "opacity-100 pointer-events-auto translate-y-0 scale-100"
                      : "opacity-0 pointer-events-none translate-y-0.5 scale-[0.995]"
                  }`}
                  aria-hidden={activeTab !== "canvas"}
                >
                  {shouldRenderCanvas ? (
                    <Suspense fallback={null}>
                      <LazyCanvasListPage
                        tabId={tabId ?? ""}
                        panelKey="project-canvas"
                        projectId={projectId}
                      />
                    </Suspense>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
