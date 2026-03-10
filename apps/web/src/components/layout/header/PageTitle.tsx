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
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarDays, Clock, LayoutDashboard, Mail, Palette, Settings, Sparkles } from "lucide-react";
import { useNavigation } from "@/hooks/use-navigation";
import { useTabs } from "@/hooks/use-tabs";
import { useTabView } from "@/hooks/use-tab-view";
import { closeSettingsTab } from "@/lib/globalShortcuts";

/**
 * PageTitle 组件
 *
 * 在 Header 中显示当前页面的标题
 * 根据导航状态和当前 Tab 信息动态显示标题
 */
export const PageTitle = () => {
  const { t } = useTranslation('nav');
  const viewType = useNavigation((s) => s.activeViewType);
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeTab = useTabView(activeTabId ?? undefined);
  const closeTab = useTabs((s) => s.closeTab);

  const isBoardViewer = activeTab?.base?.component === 'board-viewer';
  const isSettingsPage = activeTab?.base?.component === 'settings-page';

  const handleBack = useCallback(() => {
    if (activeTabId) closeTab(activeTabId);
  }, [activeTabId, closeTab]);

  const handleSettingsBack = useCallback(() => {
    closeSettingsTab();
  }, []);

  const { title, icon } = useMemo<{ title: string; icon: ReactNode | null }>(() => {
    if (isSettingsPage) {
      return {
        title: t('settings'),
        icon: <Settings className="h-4 w-4 text-orange-700/70 dark:text-orange-300/70" />,
      };
    }
    if (isBoardViewer) {
      return {
        title: activeTab?.title ?? t('canvas'),
        icon: null,
      };
    }
    if (viewType === 'project') {
      const raw = activeTab?.icon;
      const isEmoji = raw && /\p{Emoji_Presentation}/u.test(raw);
      const projectIcon = isEmoji
        ? <span className="text-xs leading-none">{raw}</span>
        : <img src="/head_s.png" alt="" className="h-4 w-4 rounded-sm" />;
      return { title: activeTab?.title ?? t('project'), icon: projectIcon };
    }
    if (viewType === 'workspace-chat') {
      return { title: activeTab?.title ?? t('aiAssistant'), icon: null };
    }
    if (viewType === 'workbench') return { title: t('workbench'), icon: <LayoutDashboard className="h-4 w-4 text-amber-700/70 dark:text-amber-300/70" /> };
    if (viewType === 'calendar') return { title: t('calendar'), icon: <CalendarDays className="h-4 w-4 text-rose-700/70 dark:text-rose-300/70" /> };
    if (viewType === 'email') return { title: t('email'), icon: <Mail className="h-4 w-4 text-emerald-700/70 dark:text-emerald-300/70" /> };
    if (viewType === 'scheduled-tasks') return { title: t('panelTitle.scheduled-tasks-page'), icon: <Clock className="h-4 w-4 text-blue-700/70 dark:text-blue-300/70" /> };
    if (viewType === 'canvas-list') return { title: t('canvas'), icon: <Palette className="h-4 w-4 text-teal-700/70 dark:text-teal-300/70" /> };
    if (viewType === 'ai-assistant') return { title: t('aiAssistant'), icon: <Sparkles className="h-4 w-4 text-violet-700/70 dark:text-violet-300/70" /> };

    // 兜底：当 viewType 未及时更新时，从 base component 推断标题
    const baseComponent = activeTab?.base?.component;
    if (baseComponent === 'canvas-list-page') return { title: t('canvas'), icon: <Palette className="h-4 w-4 text-teal-700/70 dark:text-teal-300/70" /> };
    if (baseComponent === 'workspace-desktop') return { title: t('workbench'), icon: <LayoutDashboard className="h-4 w-4 text-amber-700/70 dark:text-amber-300/70" /> };
    if (baseComponent === 'calendar-page') return { title: t('calendar'), icon: <CalendarDays className="h-4 w-4 text-rose-700/70 dark:text-rose-300/70" /> };
    if (baseComponent === 'email-page') return { title: t('email'), icon: <Mail className="h-4 w-4 text-emerald-700/70 dark:text-emerald-300/70" /> };
    if (baseComponent === 'scheduled-tasks-page') return { title: t('panelTitle.scheduled-tasks-page'), icon: <Clock className="h-4 w-4 text-blue-700/70 dark:text-blue-300/70" /> };

    return { title: '', icon: null };
  }, [viewType, activeTab, isBoardViewer, isSettingsPage, t]);

  if (!title) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {isSettingsPage && (
        <button
          type="button"
          onClick={handleSettingsBack}
          className="flex items-center gap-1 h-6 rounded-full px-2 text-xs font-medium bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:bg-orange-400/15 dark:text-orange-300 dark:hover:bg-orange-400/25 transition-colors duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('header.back')}
        </button>
      )}
      {isBoardViewer && (
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 h-6 rounded-full px-2 text-xs font-medium bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 dark:bg-teal-400/15 dark:text-teal-300 dark:hover:bg-teal-400/25 transition-colors duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('canvasList.back')}
        </button>
      )}
      {icon}
      <h1 className="text-sm font-medium text-foreground/80 truncate">
        {title}
      </h1>
    </div>
  );
};
