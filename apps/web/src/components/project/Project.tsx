"use client";

import * as ScrollArea from "@radix-ui/react-scroll-area";
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
import { useTabs } from "@/hooks/use-tabs";
import { useProject } from "@/hooks/use-project";
import { useProjects } from "@/hooks/use-projects";
import ProjectIndex, { ProjectIndexHeader } from "./index/ProjectIndex";
import ProjectTasks, { ProjectTasksHeader } from "./ProjectTasks";
import ProjectTabs, { PROJECT_TABS, type ProjectTabValue } from "./ProjectTabs";
import ProjectFileSystem, {
  type ProjectBreadcrumbInfo,
} from "./filesystem/components/ProjectFileSystem";
import ProjectSettingsPage, {
  ProjectSettingsHeader,
} from "./settings/ProjectSettingsPage";

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

interface ProjectFileSystemHeaderProps {
  /** Whether the file system data is loading. */
  isLoading: boolean;
  /** Display title for the current project. */
  pageTitle: string;
}

/** Project file system header. */
const ProjectFileSystemHeader = memo(function ProjectFileSystemHeader({
  isLoading,
  pageTitle,
}: ProjectFileSystemHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">文件</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

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

export default function ProjectPage({
  projectId,
  rootUri,
  tabId,
  projectTab,
  fileUri: externalFileUri,
}: ProjectPageProps) {
  const tabActive = useTabActive();
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const setTabBaseParams = useTabs((s) => s.setTabBaseParams);
  const setTabTitle = useTabs((s) => s.setTabTitle);
  const setTabIcon = useTabs((s) => s.setTabIcon);
  const appliedWidthRef = useRef(false);
  const mountedScopeRef = useRef<{ rootUri?: string; tabId?: string }>({
    rootUri,
    tabId,
  });

  const {
    data: projectData,
    isLoading,
    invalidateProject,
    invalidateProjectList,
  } = useProject(projectId);
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
  /** Homepage dirty state. */
  const [indexDirty, setIndexDirty] = useState(false);
  /** Puck header controls mount target. */
  const indexControlsRef = useRef<HTMLDivElement | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(rootUri ?? null);

  const pageTitle = localTitle ?? projectData?.project?.title ?? "Untitled Project";
  const titleIcon: string | undefined =
    localIcon ?? projectData?.project?.icon ?? undefined;
  // 逻辑：项目数据未加载前不覆盖持久化标题/图标，避免切换时闪动。
  const shouldSyncTabMeta = localTitle !== null || localIcon !== null || Boolean(projectData?.project);
  const shouldRenderIndex = activeTab === "index" || mountedTabs.has("index");
  const shouldRenderFiles = activeTab === "files" || mountedTabs.has("files");
  const shouldRenderTasks = activeTab === "tasks" || mountedTabs.has("tasks");
  const shouldRenderSettings = activeTab === "settings" || mountedTabs.has("settings");

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
    // 中文注释：同步服务端标题，避免更新后短暂回退。
    if (!projectData?.project) return;
    setLocalTitle(projectData.project.title ?? null);
  }, [projectData?.project]);

  useEffect(() => {
    // 中文注释：同步服务端图标，避免更新后短暂回退。
    if (!projectData?.project) return;
    setLocalIcon(projectData.project.icon ?? null);
  }, [projectData?.project]);

  useEffect(() => {
    if (!tabId) return;
    if (!shouldSyncTabMeta) return;
    // 中文注释：同步标题到 tab，保持标题一致。
    setTabTitle(tabId, pageTitle);
  }, [pageTitle, setTabTitle, shouldSyncTabMeta, tabId]);

  useEffect(() => {
    if (!tabId) return;
    if (!shouldSyncTabMeta) return;
    // 中文注释：同步图标到 tab，保持图标一致。
    setTabIcon(tabId, titleIcon);
  }, [setTabIcon, shouldSyncTabMeta, tabId, titleIcon]);

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
    setTabLeftWidthPercent(tabId, 90);
    appliedWidthRef.current = true;
  }, [tabActive, tabId, setTabLeftWidthPercent]);

  // 面板按需挂载，header 常驻渲染并用 CSS 过渡控制显示与交互。
  const headerBaseClass =
    "flex min-h-[36px] items-center pl-2 transition-opacity duration-240 ease-out min-w-0";
  const panelBaseClass =
    "absolute inset-0 box-border pt-0 transition-opacity duration-240 ease-out";

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
    <div className="project-shell flex h-full w-full flex-col min-h-0">
      <div className="project-header w-full min-w-0">
        <div className="project-header-main relative min-w-0 min-h-[36px]">
          <div
            className={`${headerBaseClass} ${
              activeTab === "index"
                ? "relative opacity-100 pointer-events-auto w-full"
                : "absolute inset-0 opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "index"}
          >
            <ProjectIndexHeader
              isLoading={isLoading}
              projectId={projectId}
              projectTitle={pageTitle}
              titleIcon={titleIcon}
              currentTitle={projectData?.project?.title ?? undefined}
              isUpdating={updateProject.isPending}
              onUpdateTitle={handleUpdateTitle}
              onUpdateIcon={handleUpdateIcon}
              isReadOnly={indexReadOnly}
              onSetReadOnly={handleSetIndexReadOnly}
              controlsSlotRef={indexControlsRef}
              showControls={!indexReadOnly}
            />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "files"
                ? "relative opacity-100 pointer-events-auto w-full"
                : "absolute inset-0 opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "files"}
          >
            <ProjectFileSystemHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "tasks"
                ? "relative opacity-100 pointer-events-auto w-full"
                : "absolute inset-0 opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "tasks"}
          >
            <ProjectTasksHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "settings"
                ? "relative opacity-100 pointer-events-auto w-full"
                : "absolute inset-0 opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "settings"}
          >
            <ProjectSettingsHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
        </div>
        <div className="project-header-tabs">
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
                id="project-panel-index"
                role="tabpanel"
                aria-labelledby="project-tab-index"
                className={`${panelBaseClass} ${
                  activeTab === "index"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
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
                    controlsSlotRef={indexControlsRef}
                  />
                ) : null}
              </div>
              <div
                id="project-panel-files"
                role="tabpanel"
                aria-labelledby="project-tab-files"
                className={`${panelBaseClass} ${
                  activeTab === "files"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "files"}
              >
                {shouldRenderFiles ? (
                  <ProjectFileSystem
                    projectId={projectId}
                    rootUri={rootUri}
                    currentUri={fileUri}
                    isLoading={isLoading}
                    isGitProject={isGitProject}
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
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "tasks"}
              >
                {shouldRenderTasks ? (
                  <ProjectTasks isLoading={isLoading} />
                ) : null}
              </div>
              <div
                id="project-panel-settings"
                role="tabpanel"
                aria-labelledby="project-tab-settings"
                className={`${panelBaseClass} ${
                  activeTab === "settings"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={activeTab !== "settings"}
              >
                {shouldRenderSettings ? (
                  <ProjectSettingsPage projectId={projectId} rootUri={rootUri} />
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
