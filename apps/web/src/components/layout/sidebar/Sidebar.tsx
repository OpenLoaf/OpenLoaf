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

import { useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { SidebarHistory } from "@/components/layout/sidebar/SidebarHistory";
import { ProjectSidebarContent } from "@/components/layout/sidebar/ProjectSidebar";
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
import { Building2, Inbox, LayoutDashboard, LayoutTemplate, Palette, Sparkles } from "lucide-react";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useAppState } from "@/hooks/use-app-state";
import { useNavigation } from "@/hooks/use-navigation";
import { Kbd, KbdGroup } from "@openloaf/ui/kbd";
import { AI_ASSISTANT_TAB_INPUT, CANVAS_LIST_TAB_INPUT, PROJECT_LIST_TAB_INPUT, TEMP_CANVAS_TAB_INPUT, TEMP_CHAT_TAB_INPUT, WORKBENCH_TAB_INPUT } from "@openloaf/api/common";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { useIsNarrowScreen } from "@/hooks/use-mobile";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { SidebarUserAccount } from "@/components/layout/sidebar/SidebarUserAccount";
import { BOARD_VIEWER_COMPONENT } from "@/hooks/layout-utils";
import { isProjectMode } from "@/lib/project-mode";

const SIDEBAR_PRIMARY_ACTIVE_CLASS =
  "data-[active=true]:!bg-sidebar-accent data-[active=true]:!text-sidebar-accent-foreground";

const SIDEBAR_PRIMARY_COLOR_CLASS = {
  calendar:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-blue/70 hover:[&>svg]:text-ol-blue ${SIDEBAR_PRIMARY_ACTIVE_CLASS}`,
  scheduledTasks:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-rose-700/70 dark:[&>svg]:text-rose-300/70 hover:[&>svg]:text-rose-700 dark:hover:[&>svg]:text-rose-200 ${SIDEBAR_PRIMARY_ACTIVE_CLASS}`,
  email:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-green/70 hover:[&>svg]:text-ol-green ${SIDEBAR_PRIMARY_ACTIVE_CLASS}`,
  workbench:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-green/70 hover:[&>svg]:text-ol-green ${SIDEBAR_PRIMARY_ACTIVE_CLASS}`,
  aiAssistant:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-amber/70 hover:[&>svg]:text-ol-amber ${SIDEBAR_PRIMARY_ACTIVE_CLASS}`,
  canvas:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-purple/70 hover:[&>svg]:text-ol-purple ${SIDEBAR_PRIMARY_ACTIVE_CLASS}`,
  projectList:
    `group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-blue/70 hover:[&>svg]:text-ol-blue ${SIDEBAR_PRIMARY_ACTIVE_CLASS}`,
} as const;

const SIDEBAR_SEARCH_ICON_CLASS =
  "group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-ol-blue/70 hover:[&>svg]:text-ol-blue";

const SIDEBAR_MODE_SWAP_TRANSITION = {
  duration: 0.18,
  ease: [0.2, 0, 0, 1],
} as const;

const SHOW_TEMPLATE_ENTRY = false;
const SHOW_INBOX_ENTRY = false;

const SIDEBAR_PRIMARY_PAGE_BASE_IDS = new Set([
  WORKBENCH_TAB_INPUT.baseId,
  "base:calendar",
  "base:scheduled-tasks",
  "base:mailbox",
  CANVAS_LIST_TAB_INPUT.baseId,
  PROJECT_LIST_TAB_INPUT.baseId,
]);

const SIDEBAR_PRIMARY_PAGE_COMPONENTS = new Set([
  WORKBENCH_TAB_INPUT.component,
  "calendar-page",
  "scheduled-tasks-page",
  "email-page",
  CANVAS_LIST_TAB_INPUT.component,
  PROJECT_LIST_TAB_INPUT.component,
]);

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { t } = useTranslation('nav');
  const prefersReducedMotion = useReducedMotion();
  const navigate = useAppView((s) => s.navigate);
  const setTitle = useAppView((s) => s.setTitle);
  const setIcon = useAppView((s) => s.setIcon);
  const appState = useAppState();
  const setBase = useLayoutState((s) => s.setBase);
  const clearStack = useLayoutState((s) => s.clearStack);
  const setActiveView = useNavigation((s) => s.setActiveView);
  const activeViewType = useNavigation((s) => s.activeViewType);
  const setActiveGlobalChat = useNavigation((s) => s.setActiveGlobalChat);
  const isNarrow = useIsNarrowScreen(900);
  const nav = useSidebarNavigation();

  const activeBaseId = appState.base?.id;
  const activeBaseComponent = appState.base?.component;
  const activeStackComponent = appState.stack?.find((item) => item.id === appState.activeStackItemId)?.component
    ?? appState.stack?.at(-1)?.component;
  const activeForegroundComponent = activeStackComponent ?? activeBaseComponent;
  const shouldShowProjectSidebar = isProjectMode(appState.projectShell);
  const sidebarMode = shouldShowProjectSidebar ? "project" : "global";
  // 逻辑：ai-chat 的 base 会在 store 层被归一化为 undefined，需要用 title 兜底。
  const isMenuActive = (input: { baseId?: string; title?: string; component?: string }) => {
    // 逻辑：当前为单页面模式，stack 在前景时不再按底层 base 高亮 sidebar。
    if (activeStackComponent) return false;
    if (input.baseId && activeBaseId === input.baseId) return true;
    if (input.component === "ai-chat" && !activeBaseId && appState.title === input.title) return true;
    return false;
  };
  // 逻辑：Sidebar 选中态跟随当前前景页面；仅在前景页面缺失时，才回退到导航态。
  const isCanvasViewerActive = activeForegroundComponent === BOARD_VIEWER_COMPONENT;
  const isCanvasListActive =
    activeForegroundComponent === CANVAS_LIST_TAB_INPUT.component ||
    (!activeForegroundComponent && activeViewType === "canvas-list");
  // 逻辑：项目空间同样按前景页面判断，避免设置页等覆盖层出现时误高亮。
  const isProjectListActive =
    activeForegroundComponent === PROJECT_LIST_TAB_INPUT.component ||
    (!activeForegroundComponent && activeViewType === "project-list");
  const isWorkbenchActive =
    (activeForegroundComponent
      ? isWorkbenchDockContextComponent(activeForegroundComponent)
      : activeViewType === "workbench");

  const openSingletonTab = useCallback(
    (input: { baseId: string; component: string; title?: string; titleKey?: string; icon: string }) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '');

      navigate({
        title: tabTitle,
        icon: input.icon,
        leftWidthPercent: input.component === "ai-chat" ? 0 : 100,
        rightChatCollapsed: input.component === "ai-chat" ? false : undefined,
        base:
          input.component === "ai-chat"
            ? undefined
            : { id: input.baseId, component: input.component },
      });
    },
    [navigate],
  );

  const openPrimaryPageTab = useCallback(
    (input: { baseId: string; component: string; title?: string; titleKey?: string; icon: string; viewType?: string }) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? '');

      // 更新导航状态
      if (input.viewType) {
        setActiveView(input.viewType as any);
      }

      // 逻辑：单视图模式下直接切换 base 与显示信息。
      setBase({ id: input.baseId, component: input.component });
      clearStack();
      setTitle(tabTitle);
      setIcon(input.icon);
    },
    [
      clearStack,
      setActiveView,
      setBase,
      setIcon,
      setTitle,
    ],
  );

  // 逻辑：窄屏直接隐藏侧边栏，避免占用可用空间。
  if (isNarrow) return null;

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <AnimatePresence initial={false} mode="wait">
        {sidebarMode === "project" ? (
          <motion.div
            key="project-sidebar"
            className="flex h-full min-h-0 flex-col overflow-hidden"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.992 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.996 }}
            transition={SIDEBAR_MODE_SWAP_TRANSITION}
          >
            <ProjectSidebarContent />
          </motion.div>
        ) : (
          <motion.div
            key="global-sidebar"
            className="flex h-full min-h-0 flex-col overflow-hidden"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.992 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.996 }}
            transition={SIDEBAR_MODE_SWAP_TRANSITION}
          >
            <SidebarHeader>
              <SidebarUserAccount />
              <SidebarMenu>
                {/* 先隐藏模版入口，后续再开放。 */}
                {SHOW_TEMPLATE_ENTRY ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="模版"
                      className="group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
                      isActive={isMenuActive({
                        baseId: "base:template",
                        component: "template-page",
                        title: "模版",
                      })}
                      onClick={() =>
                        openSingletonTab({
                          baseId: "base:template",
                          component: "template-page",
                          title: "模版",
                          icon: "📄",
                        })
                      }
                      type="button"
                    >
                      <LayoutTemplate />
                      <span className="flex-1 truncate">模版</span>
                      <span className="ml-auto opacity-0 transition-opacity delay-0 group-hover/menu-item:opacity-100 group-hover/menu-item:delay-200 group-focus-visible/menu-item:opacity-100 group-focus-visible/menu-item:delay-200 group-data-[collapsible=icon]:hidden">
                        <KbdGroup className="gap-1">
                          <Kbd className="bg-transparent px-0 h-auto rounded-none">⌘</Kbd>
                          <Kbd className="bg-transparent px-0 h-auto rounded-none">J</Kbd>
                        </KbdGroup>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={t('aiAssistant')}
                    className={SIDEBAR_PRIMARY_COLOR_CLASS.aiAssistant}
                    isActive={(() => {
                      const tempTitle = i18next.t(TEMP_CHAT_TAB_INPUT.titleKey);
                      if (!appState.base && appState.title === tempTitle) return true;
                      return isMenuActive(AI_ASSISTANT_TAB_INPUT);
                    })()}
                    onClick={nav.openTempChat}
                    type="button"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="flex-1 truncate">{t('aiAssistant')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={t('workbench')}
                    className={SIDEBAR_PRIMARY_COLOR_CLASS.workbench}
                    isActive={isWorkbenchActive || isMenuActive(WORKBENCH_TAB_INPUT)}
                    onClick={() => openPrimaryPageTab({ ...WORKBENCH_TAB_INPUT, viewType: 'workbench' })}
                    type="button"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="flex-1 truncate">{t('workbench')}</span>
                    <span className="ml-auto opacity-0 transition-opacity delay-0 group-hover/menu-item:opacity-100 group-hover/menu-item:delay-200 group-focus-visible/menu-item:opacity-100 group-focus-visible/menu-item:delay-200 group-data-[collapsible=icon]:hidden">
                      <KbdGroup className="gap-1">
                        <Kbd className="bg-transparent px-0 h-auto rounded-none">⌘</Kbd>
                        <Kbd className="bg-transparent px-0 h-auto rounded-none">T</Kbd>
                      </KbdGroup>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={t('smartCanvas')}
                    className={SIDEBAR_PRIMARY_COLOR_CLASS.canvas}
                    isActive={isCanvasListActive || isMenuActive(CANVAS_LIST_TAB_INPUT) || isCanvasViewerActive}
                    onClick={() =>
                      openPrimaryPageTab({
                        ...CANVAS_LIST_TAB_INPUT,
                        viewType: 'canvas-list',
                      })
                    }
                    type="button"
                  >
                    <Palette className="h-4 w-4" />
                    <span className="flex-1 truncate">{t('smartCanvas')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={t('sidebarProjectSpace')}
                    className={SIDEBAR_PRIMARY_COLOR_CLASS.projectList}
                    isActive={isProjectListActive || isMenuActive(PROJECT_LIST_TAB_INPUT)}
                    onClick={() =>
                      openPrimaryPageTab({
                        ...PROJECT_LIST_TAB_INPUT,
                        viewType: 'project-list',
                      })
                    }
                    type="button"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="flex-1 truncate">{t('sidebarProjectSpace')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* 先隐藏收集箱入口，后续再开放。 */}
                {SHOW_INBOX_ENTRY ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="收集箱"
                      className="group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
                      isActive={isMenuActive({
                        baseId: "base:inbox",
                        component: "inbox-page",
                        title: "收集箱",
                      })}
                      onClick={() =>
                        openSingletonTab({
                          baseId: "base:inbox",
                          component: "inbox-page",
                          title: "收集箱",
                          icon: "📥",
                        })
                      }
                      type="button"
                    >
                      <Inbox />
                      <span className="flex-1 truncate">收集箱</span>
                      <span className="ml-auto opacity-0 transition-opacity delay-0 group-hover/menu-item:opacity-100 group-hover/menu-item:delay-200 group-focus-visible/menu-item:opacity-100 group-focus-visible/menu-item:delay-200 group-data-[collapsible=icon]:hidden">
                        <KbdGroup className="gap-1">
                          <Kbd className="bg-transparent px-0 h-auto rounded-none">⌘</Kbd>
                          <Kbd className="bg-transparent px-0 h-auto rounded-none">I</Kbd>
                        </KbdGroup>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarHeader>
            <SidebarContent className="flex flex-col overflow-hidden">
              <div
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
                style={{ "--sidebar-accent": "var(--sidebar-project-accent)", "--sidebar-accent-foreground": "var(--sidebar-project-accent-fg)" } as React.CSSProperties}
              >
                <SidebarHistory />
              </div>
            </SidebarContent>
            <SidebarFooter />
          </motion.div>
        )}
      </AnimatePresence>
    </Sidebar>
  );
};
