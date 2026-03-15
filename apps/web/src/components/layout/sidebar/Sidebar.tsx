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
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { isWorkbenchDockContextComponent } from "@/components/layout/global-entry-dock";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@openloaf/ui/sidebar";
import { Bot, CalendarDays, Clock, FolderClosed, LayoutDashboard, Mail, Palette, Search, Settings, Sparkles, Wand2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useAppState } from "@/hooks/use-app-state";
import { useLayoutState } from "@/hooks/use-layout-state";
import {
  AGENTS_TAB_INPUT,
  AI_ASSISTANT_TAB_INPUT,
  CANVAS_LIST_TAB_INPUT,
  PROJECT_LIST_TAB_INPUT,
  SKILLS_TAB_INPUT,
  TEMP_CHAT_TAB_INPUT,
  WORKBENCH_TAB_INPUT,
} from "@openloaf/api/common";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { useIsNarrowScreen } from "@/hooks/use-mobile";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { CompactUserAvatar } from "@/components/layout/sidebar/SidebarUserAccount";
import { BOARD_VIEWER_COMPONENT, resolveLayoutViewState } from "@/hooks/layout-utils";
import { isProjectWindowMode, isBoardWindowMode } from "@/lib/window-mode";
import { openPrimaryPage } from "@/lib/primary-page-navigation";

const ICON_BTN_BASE =
  "flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150";

const ICON_COLOR = {
  amber:
    "[&>svg]:text-ol-amber/70 hover:[&>svg]:text-ol-amber data-[active=true]:bg-ol-amber/15 dark:data-[active=true]:bg-ol-amber/20 data-[active=true]:[&>svg]:text-ol-amber",
  green:
    "[&>svg]:text-ol-green/70 hover:[&>svg]:text-ol-green data-[active=true]:bg-ol-green/15 dark:data-[active=true]:bg-ol-green/20 data-[active=true]:[&>svg]:text-ol-green",
  purple:
    "[&>svg]:text-ol-purple/70 hover:[&>svg]:text-ol-purple data-[active=true]:bg-ol-purple/15 dark:data-[active=true]:bg-ol-purple/20 data-[active=true]:[&>svg]:text-ol-purple",
  blue:
    "[&>svg]:text-ol-blue/70 hover:[&>svg]:text-ol-blue data-[active=true]:bg-ol-blue/15 dark:data-[active=true]:bg-ol-blue/20 data-[active=true]:[&>svg]:text-ol-blue",
  sky:
    "[&>svg]:text-sky-500/70 hover:[&>svg]:text-sky-500 data-[active=true]:bg-sky-500/15 dark:data-[active=true]:bg-sky-500/20 data-[active=true]:[&>svg]:text-sky-500",
  teal:
    "[&>svg]:text-teal-500/70 hover:[&>svg]:text-teal-500 data-[active=true]:bg-teal-500/15 dark:data-[active=true]:bg-teal-500/20 data-[active=true]:[&>svg]:text-teal-500",
  rose:
    "[&>svg]:text-rose-500/70 hover:[&>svg]:text-rose-500 data-[active=true]:bg-rose-500/15 dark:data-[active=true]:bg-rose-500/20 data-[active=true]:[&>svg]:text-rose-500",
  black:
    "[&>svg]:text-sidebar-foreground/80 hover:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground",
} as const;

function IconNavItem({
  icon: Icon,
  tooltip,
  color,
  isActive = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  color: keyof typeof ICON_COLOR;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            className={`${ICON_BTN_BASE} ${ICON_COLOR[color]} justify-center px-0`}
            isActive={isActive}
            onClick={onClick}
            type="button"
          >
            <Icon className="h-5 w-5" />
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { t } = useTranslation("nav");
  const appState = useAppState();
  const layoutView = useMemo(() => resolveLayoutViewState(appState), [appState]);
  const isNarrow = useIsNarrowScreen(900);
  const nav = useSidebarNavigation();
  const setSearchOpen = useGlobalOverlay((s) => s.setSearchOpen);

  const activeBaseId = appState.base?.id;
  const activeBaseComponent = appState.base?.component;
  const activeStackComponent =
    appState.stack?.find((item) => item.id === appState.activeStackItemId)?.component ??
    appState.stack?.at(-1)?.component;
  const activeForegroundComponent =
    activeStackComponent ?? layoutView.foregroundComponent ?? activeBaseComponent;

  const isMenuActive = (input: { baseId?: string; title?: string; component?: string }) => {
    if (activeStackComponent) return false;
    if (input.baseId && activeBaseId === input.baseId) return true;
    if (input.component === "ai-chat" && !activeBaseId && appState.title === input.title)
      return true;
    return false;
  };

  const isCanvasViewerActive = activeForegroundComponent === BOARD_VIEWER_COMPONENT;
  const isCanvasListActive =
    activeForegroundComponent === CANVAS_LIST_TAB_INPUT.component ||
    (!activeForegroundComponent && layoutView.viewType === "canvas-list");
  const isProjectListActive =
    activeForegroundComponent === PROJECT_LIST_TAB_INPUT.component ||
    (!activeForegroundComponent && layoutView.viewType === "project-list");
  const isWorkbenchActive = activeForegroundComponent
    ? isWorkbenchDockContextComponent(activeForegroundComponent)
    : layoutView.viewType === "workbench";
  const isCalendarActive = activeForegroundComponent === "calendar-page" || (!activeForegroundComponent && layoutView.viewType === "calendar");
  const isEmailActive = activeForegroundComponent === "email-page" || (!activeForegroundComponent && layoutView.viewType === "email");
  const isTasksActive = activeForegroundComponent === "scheduled-tasks-page" || (!activeForegroundComponent && layoutView.viewType === "scheduled-tasks");
  const isSkillsActive = activeForegroundComponent === SKILLS_TAB_INPUT.component || isMenuActive(SKILLS_TAB_INPUT);
  const isAgentsActive = activeForegroundComponent === AGENTS_TAB_INPUT.component || isMenuActive(AGENTS_TAB_INPUT);
  const isSettingsActive = layoutView.isSettingsPage;
  const isInProject = layoutView.isProjectContext;

  const openPrimaryPageTab = useCallback(
    (input: {
      baseId: string;
      component: string;
      title?: string;
      titleKey?: string;
      icon: string;
    }) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? "");
      openPrimaryPage({
        baseId: input.baseId,
        component: input.component,
        title: tabTitle,
        icon: input.icon,
      });
    },
    [],
  );

  if (isNarrow || isProjectWindowMode() || isBoardWindowMode()) return null;

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <SidebarHeader className="items-center px-0 py-2">
        <CompactUserAvatar />
      </SidebarHeader>

      <SidebarContent className="items-center px-0">
        <SidebarMenu className="items-center gap-1 px-1.5">
          {/* Core */}
          <IconNavItem
            icon={Sparkles}
            tooltip={t("aiAssistant")}
            color="amber"
            isActive={!isInProject && (() => {
              // 无 base 且无项目 = 全局聊天模式（包括临时对话和历史会话）
              if (!appState.base && !appState.projectShell) return true;
              return isMenuActive(AI_ASSISTANT_TAB_INPUT);
            })()}
            onClick={nav.openTempChat}
          />
          <IconNavItem
            icon={Palette}
            tooltip={t("smartCanvas")}
            color="purple"
            isActive={
              !isInProject &&
              (isCanvasListActive ||
              isMenuActive(CANVAS_LIST_TAB_INPUT) ||
              isCanvasViewerActive)
            }
            onClick={() => openPrimaryPageTab({ ...CANVAS_LIST_TAB_INPUT })}
          />
          <IconNavItem
            icon={FolderClosed}
            tooltip={t("sidebarProjectSpace")}
            color="blue"
            isActive={
              (isProjectListActive ||
                isMenuActive(PROJECT_LIST_TAB_INPUT) ||
                isInProject) &&
              !isSettingsActive
            }
            onClick={() => openPrimaryPageTab({ ...PROJECT_LIST_TAB_INPUT })}
          />

          {/* Separator */}
          <div className="my-1 h-px w-6 bg-sidebar-border" />

          {/* Tools */}
          <IconNavItem
            icon={LayoutDashboard}
            tooltip={t("workbench")}
            color="green"
            isActive={!isInProject && (isWorkbenchActive || isMenuActive(WORKBENCH_TAB_INPUT))}
            onClick={() => openPrimaryPageTab({ ...WORKBENCH_TAB_INPUT })}
          />
          <IconNavItem
            icon={CalendarDays}
            tooltip={t("calendar")}
            color="sky"
            isActive={!isInProject && isCalendarActive}
            onClick={() =>
              openPrimaryPageTab({ baseId: "base:calendar", component: "calendar-page", titleKey: "nav:calendar", icon: "🗓️" })
            }
          />
          <IconNavItem
            icon={Mail}
            tooltip={t("email")}
            color="teal"
            isActive={!isInProject && isEmailActive}
            onClick={() =>
              openPrimaryPageTab({ baseId: "base:mailbox", component: "email-page", titleKey: "nav:email", icon: "📧" })
            }
          />
          <IconNavItem
            icon={Clock}
            tooltip={t("tasks")}
            color="rose"
            isActive={!isInProject && isTasksActive}
            onClick={() =>
              openPrimaryPageTab({ baseId: "base:scheduled-tasks", component: "scheduled-tasks-page", titleKey: "nav:tasks", icon: "⏰" })
            }
          />
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="items-center px-0 py-2 gap-1">
        <SidebarMenu className="items-center gap-1 px-1.5">
          <IconNavItem
            icon={Search}
            tooltip={`${t("search")} (⌘K)`}
            color="blue"
            onClick={() => setSearchOpen(true)}
          />
          <IconNavItem
            icon={Bot}
            tooltip={t("agents")}
            color="blue"
            isActive={!isInProject && isAgentsActive}
            onClick={() => openPrimaryPageTab({ ...AGENTS_TAB_INPUT })}
          />
          <IconNavItem
            icon={Wand2}
            tooltip={t("skills")}
            color="purple"
            isActive={!isInProject && isSkillsActive}
            onClick={() => openPrimaryPageTab({ ...SKILLS_TAB_INPUT })}
          />
          <IconNavItem
            icon={Settings}
            tooltip={t("settings")}
            color="black"
            isActive={isSettingsActive}
            onClick={() => {
              // Sidebar 中的设置按钮始终打开全局设置，不跟随项目上下文
              const currentBase = useLayoutState.getState().base;
              if (currentBase?.component === "settings-page") return;
              openPrimaryPageTab({
                baseId: "settings",
                component: "settings-page",
                titleKey: "nav:settings",
                icon: "⚙️",
              });
            }}
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
