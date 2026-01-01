"use client";

import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useTabs } from "@/hooks/use-tabs";
import { useProject } from "@/hooks/use-project";
import ProjectInfo, { ProjectIntroHeader } from "./intro/ProjectIntro";
import ProjectTasks, { ProjectTasksHeader } from "./ProjectTasks";
import ProjectSkills, { ProjectSkillsHeader } from "./ProjectSkills";
import ProjectTabs, { PROJECT_TABS, type ProjectTabValue } from "./ProjectTabs";
import ProjectFileSystem, {
  ProjectFileSystemHeader,
  type ProjectBreadcrumbInfo,
} from "./filesystem/ProjectFileSystem";
import ProjectSettingsPage, {
  ProjectSettingsHeader,
} from "./settings/ProjectSettingsPage";

interface ProjectPageProps {
  tabId?: string;
  projectId?: string;
  rootUri?: string;
  projectTab?: ProjectTabValue;
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
  rootUri: string;
  title: string;
  icon?: string;
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

export default function ProjectPage({ projectId, rootUri, tabId, projectTab }: ProjectPageProps) {
  const tabActive = useTabActive();
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const setTabBaseParams = useTabs((s) => s.setTabBaseParams);
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
  const [fileUri, setFileUri] = useState<string | null>(rootUri ?? null);

  const pageTitle = projectData?.project?.title || "Untitled Project";
  const titleIcon: string | undefined = projectData?.project?.icon ?? undefined;
  const shouldRenderIntro = activeTab === "intro" || mountedTabs.has("intro");
  const shouldRenderFiles = activeTab === "files" || mountedTabs.has("files");
  const shouldRenderTasks = activeTab === "tasks" || mountedTabs.has("tasks");
  const shouldRenderSkills = activeTab === "skills" || mountedTabs.has("skills");
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
      updateProject.mutate({ projectId, title: nextTitle });
    },
    [projectId, updateProject]
  );

  /** Update project icon with optimistic cache. */
  const handleUpdateIcon = useCallback(
    (nextIcon: string) => {
      if (!projectId) return;
      updateProject.mutate({ projectId, icon: nextIcon });
    },
    [projectId, updateProject]
  );

  useEffect(() => {
    appliedWidthRef.current = false;
  }, [projectId, rootUri, tabId]);

  // 页面切换时重置只读状态，避免沿用旧页面的编辑状态。
  useEffect(() => {
    setIntroReadOnly(true);
  }, [projectId, rootUri]);

  useEffect(() => {
    setFileUri(rootUri ?? null);
  }, [rootUri]);

  const projectListQuery = useQuery(trpc.project.list.queryOptions());
  const projectLookup = useMemo(
    () => buildProjectLookup(projectListQuery.data as ProjectTreeNode[] | undefined),
    [projectListQuery.data]
  );

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
              projectId={projectId}
              projectTitle={pageTitle}
              titleIcon={titleIcon}
              currentTitle={projectData?.project?.title ?? undefined}
              isUpdating={updateProject.isPending}
              onUpdateTitle={handleUpdateTitle}
              onUpdateIcon={handleUpdateIcon}
              isReadOnly={introReadOnly}
              onSetReadOnly={handleSetIntroReadOnly}
            />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "files"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "files"}
          >
            <ProjectFileSystemHeader isLoading={isLoading} pageTitle={pageTitle} />
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
              activeTab === "skills"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "skills"}
          >
            <ProjectSkillsHeader isLoading={isLoading} pageTitle={pageTitle} />
          </div>
          <div
            className={`${headerBaseClass} ${
              activeTab === "settings"
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={activeTab !== "settings"}
          >
            <ProjectSettingsHeader isLoading={isLoading} pageTitle={pageTitle} />
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
                    projectId={projectId}
                    rootUri={rootUri}
                    projectTitle={pageTitle}
                    readOnly={introReadOnly}
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
                  <ProjectSkills isLoading={isLoading} />
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
