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

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, PencilLine } from "lucide-react";
import { useAppState } from "@/hooks/use-app-state";
import { applyProjectShellToTab, exitProjectShellToProjectList } from "@/lib/project-shell";
import { PROJECT_LIST_TAB_INPUT, CANVAS_LIST_TAB_INPUT } from "@openloaf/api/common";
import { isProjectWindowMode, isBoardWindowMode } from "@/lib/window-mode";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { resolveLayoutViewState } from "@/hooks/layout-utils";
import { useProject } from "@/hooks/use-project";
import { useHeaderSlot } from "@/hooks/use-header-slot";
import {
  type PreviousViewSnapshot,
  resolvePreviousViewSnapshot,
  restorePreviousViewFromBase,
} from "@/lib/primary-page-navigation";

/** Strip `/skill/[id|displayName]` format to just the display name. */
function cleanSkillTitle(title: string): string {
  if (!title.startsWith('/skill/[')) return title;
  const match = title.match(/^\/skill\/\[[^\]|]+\|([^\]]+)\]$/);
  if (match) return match[1];
  const match2 = title.match(/^\/skill\/\[([^\]]+)\]$/);
  if (match2) return match2[1];
  return title;
}

/** Resolve one localized back-button label from a captured previous view snapshot. */
function resolvePreviousViewLabel(
  snapshot: PreviousViewSnapshot | null,
  t: (key: string) => string,
) {
  if (!snapshot) return t("header.back");

  const snapshotTitle = snapshot.title?.trim() ?? "";
  const resolvedView = resolveLayoutViewState({
    ...snapshot.layout,
    projectShell: snapshot.projectShell,
    title: snapshot.title,
    chatSessionId: snapshot.chatSessionId,
    chatLoadHistory: snapshot.chatLoadHistory,
    chatParams: snapshot.chatParams,
  });

  if (snapshot.projectShell?.title?.trim()) {
    return snapshot.projectShell.title.trim();
  }

  switch (resolvedView.viewType) {
    case "project":
      return snapshotTitle || t("panelTitle.plant-page");
    case "project-list":
      return t("sidebarProjectSpace");
    case "canvas-list":
      return snapshotTitle || t("smartCanvas");
    case "workbench":
      return t("workbench");
    case "calendar":
      return t("calendar");
    case "email":
      return t("email");
    case "scheduled-tasks":
      return t("tasks");
    case "ai-assistant":
      return t("aiAssistant");
    case "global-chat":
      return snapshotTitle || t("aiAssistant");
    default:
      break;
  }

  switch (resolvedView.foregroundComponent) {
    case "settings-page":
      return t("settings");
    case "agent-management":
      return t("agents");
    case "skill-settings":
      return t("skills");
    case "connections-market":
      return t("connections");
    case "project-settings-page":
      return t("panelTitle.project-settings-page");
    case "board-viewer":
      return snapshotTitle || t("smartCanvas");
    default:
      return snapshotTitle || t("header.back");
  }
}

/**
 * PageTitle 组件
 *
 * 在 Header 中显示当前页面的标题
 * 根据导航状态和当前 Tab 信息动态显示标题
 */
export const PageTitle = () => {
  const { t } = useTranslation('nav');
  const activeTab = useAppState();
  const layoutView = useMemo(() => resolveLayoutViewState(activeTab), [activeTab]);

  const isBoardViewer = activeTab?.base?.component === 'board-viewer';
  const isSettingsPage = activeTab?.base?.component === 'settings-page';
  const requestBoardRename = useHeaderSlot((s) => s.requestBoardRename);
  const inProject = layoutView.isProjectContext;
  const isProjectWindow = isProjectWindowMode();
  const isBoardWindow = isBoardWindowMode();
  const previousViewSnapshot = useMemo(
    () => resolvePreviousViewSnapshot(activeTab?.base),
    [activeTab?.base],
  );
  const previousViewLabel = useMemo(
    () => resolvePreviousViewLabel(previousViewSnapshot, t),
    [previousViewSnapshot, t],
  );
  const BACK_BUTTON_CLASS = "text-muted-foreground/70 hover:text-foreground hover:bg-muted/40";
  const showPreviousViewBack =
    Boolean(previousViewSnapshot) && !isBoardViewer && !isProjectWindow && !isBoardWindow;

  // 画布所属项目 id（从 base params 中获取，全局和项目模式均有）
  const boardProjectId = isBoardViewer
    ? (activeTab?.base?.params as any)?.projectId as string | undefined
    : undefined;
  const { data: boardProjectData } = useProject(boardProjectId);

  // 优先从 projectShell 取项目名（项目模式），否则从查询结果取（全局模式）
  const boardProjectTitle = useMemo(() => {
    const queriedTitle = boardProjectData?.project?.title;
    if (inProject) {
      return layoutView.projectShell?.title ?? activeTab?.projectShell?.title ?? queriedTitle;
    }
    return queriedTitle;
  }, [inProject, layoutView.projectShell, activeTab?.projectShell, boardProjectData]);

  const handleBackFromBoard = useCallback(() => {
    if (restorePreviousViewFromBase(activeTab?.base)) return;

    const layout = useLayoutState.getState();
    const view = useAppView.getState();
    const previousBase = (activeTab?.base?.params as any)?.__previousBase;

    if (inProject) {
      // Board opened from within a project → restore previous base within project
      const shell = layoutView.projectShell ?? activeTab?.projectShell;
      if (previousBase && typeof previousBase === 'object') {
        layout.setBase(previousBase);
        layout.clearStack();
        if (shell) {
          view.setTitle(shell.title);
          view.setIcon(shell.icon ?? undefined);
        }
      } else if (shell) {
        applyProjectShellToTab("main", shell);
      }
    } else {
      // Board opened from global canvas list → restore previous base or go to canvas list
      if (previousBase && typeof previousBase === 'object') {
        layout.setBase(previousBase);
        layout.clearStack();
        view.setTitle(t('smartCanvas'));
        view.setIcon(CANVAS_LIST_TAB_INPUT.icon);
      } else {
        layout.setBase({ id: CANVAS_LIST_TAB_INPUT.baseId, component: CANVAS_LIST_TAB_INPUT.component });
        layout.clearStack();
        view.setTitle(t('smartCanvas'));
        view.setIcon(CANVAS_LIST_TAB_INPUT.icon);
      }
    }
  }, [inProject, layoutView.projectShell, activeTab?.projectShell, activeTab?.base?.params, t]);

  const handleBackToPreviousView = useCallback(() => {
    restorePreviousViewFromBase(activeTab?.base);
  }, [activeTab?.base]);

  const handleBackToProjectList = useCallback(() => {
    const title = t('sidebarProjectSpace');
    exitProjectShellToProjectList("main", title, PROJECT_LIST_TAB_INPUT.icon);
  }, [t]);

  const title = useMemo(() => {
    const projectShellTitle = layoutView.projectShell?.title?.trim() ?? activeTab?.projectShell?.title?.trim() ?? '';
    if (isSettingsPage) {
      return t('settings');
    }
    if (isBoardViewer) {
      return activeTab?.title ?? t('canvas');
    }
    if (layoutView.viewType === 'project') {
      return projectShellTitle || activeTab?.title || t('project');
    }
    if (layoutView.viewType === 'global-chat') {
      return t('aiAssistant');
    }
    if (layoutView.viewType === 'workbench') return t('workbench');
    if (layoutView.viewType === 'calendar') return t('calendar');
    if (layoutView.viewType === 'email') return t('email');
    if (layoutView.viewType === 'scheduled-tasks') return t('panelTitle.scheduled-tasks-page');
    if (layoutView.viewType === 'canvas-list') return t('smartCanvas');
    if (layoutView.viewType === 'ai-assistant') return t('aiAssistant');

    // 逻辑：header 左侧标题保持纯文本，避免与可点击图标的交互语义混淆。
    // 兜底：当 viewType 未及时更新时，从 base component 推断标题。
    const baseComponent = activeTab?.base?.component;
    if (baseComponent === 'canvas-list-page') return t('smartCanvas');
    if (baseComponent === 'project-list-page') return t('sidebarProjectSpace');
    if (baseComponent === 'global-desktop') return t('workbench');
    if (baseComponent === 'calendar-page') return t('calendar');
    if (baseComponent === 'email-page') return t('email');
    if (baseComponent === 'scheduled-tasks-page') return t('panelTitle.scheduled-tasks-page');

    return activeTab?.title || projectShellTitle || '';
  }, [layoutView, activeTab, isBoardViewer, isSettingsPage, t]);

  // 清洗 /skill/[id|displayName] 格式，只保留 displayName
  const cleanedTitle = useMemo(() => cleanSkillTitle(title), [title]);

  if (!cleanedTitle) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {showPreviousViewBack && (
        <button
          type="button"
          onClick={handleBackToPreviousView}
          className={`flex items-center gap-1 h-5 max-w-56 rounded-3xl px-2 font-mono text-xs font-medium uppercase tracking-wide transition-colors duration-150 ${BACK_BUTTON_CLASS}`}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{previousViewLabel}</span>
        </button>
      )}
      {inProject && !isBoardViewer && !isProjectWindow && (
        <button
          type="button"
          onClick={handleBackToProjectList}
          className={`flex items-center gap-1 h-5 rounded-3xl px-2 font-mono text-xs font-medium uppercase tracking-wide ${BACK_BUTTON_CLASS} transition-colors duration-150`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('sidebarProjectSpace')}
        </button>
      )}
      {isBoardViewer && inProject && !isBoardWindow && (
        <button
          type="button"
          onClick={handleBackFromBoard}
          className={`flex items-center gap-1 h-5 max-w-56 rounded-3xl px-2 font-mono text-xs font-medium uppercase tracking-wide ${BACK_BUTTON_CLASS} transition-colors duration-150`}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {previousViewSnapshot?.projectShell?.title
              ?? previousViewSnapshot?.title
              ?? layoutView.projectShell?.title
              ?? activeTab?.projectShell?.title
              ?? t('project')}
          </span>
        </button>
      )}
      {isBoardViewer && !inProject && !isBoardWindow && (
        <button
          type="button"
          onClick={handleBackFromBoard}
          className={`flex items-center gap-1 h-5 max-w-56 rounded-3xl px-2 font-mono text-xs font-medium uppercase tracking-wide ${BACK_BUTTON_CLASS} transition-colors duration-150`}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {previousViewSnapshot?.projectShell?.title
              ?? previousViewSnapshot?.title
              ?? t('canvasList.back')}
          </span>
        </button>
      )}
      <h1 className="text-sm font-medium text-foreground/80 truncate">
        {isBoardViewer && boardProjectTitle ? (
          <>
            <span className="text-muted-foreground/60">{boardProjectTitle}</span>
            <span className="text-muted-foreground/40 mx-1">/</span>
            {cleanedTitle}
          </>
        ) : cleanedTitle}
      </h1>
      {isBoardViewer && requestBoardRename && (
        <button
          type="button"
          onClick={requestBoardRename}
          className="shrink-0 p-1 rounded-3xl text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/50 transition-colors duration-150"
          title={t('canvasList.renameTitle')}
        >
          <PencilLine className="size-3.5" />
        </button>
      )}
    </div>
  );
};
