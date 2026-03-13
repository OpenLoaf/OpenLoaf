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
import { ArrowLeft } from "lucide-react";
import { useNavigation } from "@/hooks/use-navigation";
import { useAppState } from "@/hooks/use-app-state";
import { isProjectMode } from "@/lib/project-mode";
import { applyProjectShellToTab, exitProjectShellToProjectList } from "@/lib/project-shell";
import { PROJECT_LIST_TAB_INPUT, CANVAS_LIST_TAB_INPUT } from "@openloaf/api/common";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";

/**
 * PageTitle 组件
 *
 * 在 Header 中显示当前页面的标题
 * 根据导航状态和当前 Tab 信息动态显示标题
 */
export const PageTitle = () => {
  const { t } = useTranslation('nav');
  const viewType = useNavigation((s) => s.activeViewType);
  const activeTab = useAppState();

  const isBoardViewer = activeTab?.base?.component === 'board-viewer';
  const isSettingsPage = activeTab?.base?.component === 'settings-page';
  const inProject = isProjectMode(activeTab?.projectShell);

  const handleBackFromBoard = useCallback(() => {
    const layout = useLayoutState.getState();
    const view = useAppView.getState();
    const previousBase = (activeTab?.base?.params as any)?.__previousBase;

    if (inProject) {
      // Board opened from within a project → restore previous base within project
      const shell = activeTab?.projectShell;
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
        view.setTitle(t('canvas'));
        view.setIcon(CANVAS_LIST_TAB_INPUT.icon);
      } else {
        layout.setBase({ id: CANVAS_LIST_TAB_INPUT.baseId, component: CANVAS_LIST_TAB_INPUT.component });
        layout.clearStack();
        view.setTitle(t('canvas'));
        view.setIcon(CANVAS_LIST_TAB_INPUT.icon);
      }
      useNavigation.getState().setActiveView("canvas-list");
    }
  }, [inProject, activeTab?.projectShell, activeTab?.base?.params, t]);

  const handleBackToProjectList = useCallback(() => {
    const title = t('sidebarProjectSpace');
    exitProjectShellToProjectList("main", title, PROJECT_LIST_TAB_INPUT.icon);
  }, [t]);

  const title = useMemo(() => {
    const projectShellTitle = activeTab?.projectShell?.title?.trim() ?? '';
    if (isSettingsPage) {
      return t('settings');
    }
    if (isBoardViewer) {
      return activeTab?.title ?? t('canvas');
    }
    if (viewType === 'project') {
      return projectShellTitle || activeTab?.title || t('project');
    }
    if (viewType === 'global-chat') {
      return activeTab?.title ?? t('aiAssistant');
    }
    if (viewType === 'workbench') return t('workbench');
    if (viewType === 'calendar') return t('calendar');
    if (viewType === 'email') return t('email');
    if (viewType === 'scheduled-tasks') return t('panelTitle.scheduled-tasks-page');
    if (viewType === 'canvas-list') return t('canvas');
    if (viewType === 'ai-assistant') return t('aiAssistant');

    // 逻辑：header 左侧标题保持纯文本，避免与可点击图标的交互语义混淆。
    // 兜底：当 viewType 未及时更新时，从 base component 推断标题。
    const baseComponent = activeTab?.base?.component;
    if (baseComponent === 'canvas-list-page') return t('canvas');
    if (baseComponent === 'project-list-page') return t('sidebarProjectSpace');
    if (baseComponent === 'global-desktop') return t('workbench');
    if (baseComponent === 'calendar-page') return t('calendar');
    if (baseComponent === 'email-page') return t('email');
    if (baseComponent === 'scheduled-tasks-page') return t('panelTitle.scheduled-tasks-page');

    return projectShellTitle || '';
  }, [viewType, activeTab, isBoardViewer, isSettingsPage, t]);

  if (!title) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {inProject && !isBoardViewer && (
        <button
          type="button"
          onClick={handleBackToProjectList}
          className="flex items-center gap-1 h-6 rounded-md px-2 text-xs font-medium bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover transition-colors duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('sidebarProjectSpace')}
        </button>
      )}
      {isBoardViewer && inProject && (
        <button
          type="button"
          onClick={handleBackFromBoard}
          className="flex items-center gap-1 h-6 rounded-md px-2 text-xs font-medium bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover transition-colors duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {activeTab?.projectShell?.title ?? t('project')}
        </button>
      )}
      {isBoardViewer && !inProject && (
        <button
          type="button"
          onClick={handleBackFromBoard}
          className="flex items-center gap-1 h-6 rounded-md px-2 text-xs font-medium bg-ol-purple-bg text-ol-purple hover:bg-ol-purple-bg-hover transition-colors duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('canvasList.back')}
        </button>
      )}
      <h1 className="text-sm font-medium text-foreground/80 truncate">
        {title}
      </h1>
    </div>
  );
};
