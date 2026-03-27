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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { useAppState, getAppState } from "@/hooks/use-app-state";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useSectionSnapshot, detectCurrentSection, type SectionKey } from "@/hooks/use-section-snapshot";
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
import { openPrimaryPage, captureCurrentViewSnapshot, restoreViewSnapshot } from "@/lib/primary-page-navigation";

const ICON_BTN_BASE =
  "relative flex h-10 w-10 items-center justify-center rounded-3xl transition-colors duration-150 hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent [&>svg]:text-sidebar-foreground/60 hover:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground";

function IconNavItem({
  icon: Icon,
  tooltip,
  isActive = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  color?: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            className={`${ICON_BTN_BASE} justify-center px-0`}
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

/**
 * 基于 DOM 测量的滑动指示器，自动适配缩放和布局变化。
 * - 持续可见时：transform 滑动
 * - 隐藏→显示：直接出现在目标位置（仅 opacity 过渡）
 * - 显示→隐藏：原地淡出（仅 opacity 过渡）
 */
function SlidingIndicator({
  activeIdx,
  containerRef,
}: {
  activeIdx: number;
  containerRef: React.RefObject<HTMLUListElement | null>;
}) {
  const isVisible = activeIdx >= 0;
  const stateRef = useRef({ wasVisible: false, lastY: 0 });
  const [measuredY, setMeasuredY] = useState(0);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || activeIdx < 0) return;
    const items = container.querySelectorAll<HTMLElement>(
      ':scope > [data-sidebar="menu-item"]',
    );
    const item = items[activeIdx];
    if (!item) return;
    setMeasuredY(item.offsetTop);
  }, [activeIdx, containerRef]);

  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, measure]);

  const displayY = isVisible ? measuredY : stateRef.current.lastY;
  const shouldSlide = stateRef.current.wasVisible && isVisible;

  useEffect(() => {
    stateRef.current.wasVisible = isVisible;
    if (isVisible) stateRef.current.lastY = measuredY;
  });

  const transition = shouldSlide
    ? "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease"
    : "opacity 200ms ease";

  return (
    <>
      {/* 背景高亮 — 用单一 transform 同时处理居中和 Y 偏移，避免与 Tailwind translate 冲突 */}
      <div
        className="pointer-events-none absolute z-0 w-10 h-10 rounded-3xl bg-sidebar-accent"
        style={{
          left: "50%",
          transform: `translate(-50%, ${displayY}px)`,
          opacity: isVisible ? 1 : 0,
          transition,
        }}
      />
      {/* 左侧竖条（按钮内部左侧） */}
      <div
        className="pointer-events-none absolute z-10 h-5 w-[3px] rounded-full bg-sidebar-foreground"
        style={{
          left: "calc(50% - 20px)",
          transform: `translateY(${displayY + 10}px)`,
          opacity: isVisible ? 1 : 0,
          transition,
        }}
      />
    </>
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
  const contentMenuRef = useRef<HTMLUListElement>(null);
  const footerMenuRef = useRef<HTMLUListElement>(null);
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

  /* ── 激活态布尔 → 索引 ── */
  const isAiActive = !isInProject && (
    (!appState.base && !appState.projectShell) || isMenuActive(AI_ASSISTANT_TAB_INPUT)
  );
  const isCanvasActive = !isInProject && (
    isCanvasListActive || isMenuActive(CANVAS_LIST_TAB_INPUT) || isCanvasViewerActive
  );
  const isProjectActive = (
    isProjectListActive || isMenuActive(PROJECT_LIST_TAB_INPUT) || isInProject
  ) && !isSettingsActive;

  const activeContentIdx = isAiActive ? 0
    : isCanvasActive ? 1
    : isProjectActive ? 2
    : (!isInProject && (isWorkbenchActive || isMenuActive(WORKBENCH_TAB_INPUT))) ? 3
    : (!isInProject && isCalendarActive) ? 4
    : (!isInProject && isEmailActive) ? 5
    : (!isInProject && isTasksActive) ? 6
    : -1;

  const activeFooterIdx = isSettingsActive ? 3
    : (!isInProject && isAgentsActive) ? 1
    : (!isInProject && isSkillsActive) ? 2
    : -1;

  const openPrimaryPageTab = useCallback(
    (input: {
      baseId: string;
      component: string;
      title?: string;
      titleKey?: string;
      icon: string;
      preserveCurrentView?: boolean;
      baseParams?: Record<string, unknown>;
    }) => {
      const tabTitle = input.titleKey ? i18next.t(input.titleKey) : (input.title ?? "");
      openPrimaryPage({
        baseId: input.baseId,
        component: input.component,
        title: tabTitle,
        icon: input.icon,
      }, {
        preserveCurrentView: input.preserveCurrentView,
        baseParams: input.baseParams,
      });
    },
    [],
  );

  /**
   * 切换 sidebar 节时：保存当前节快照 → 恢复目标节快照（若有）→ 否则走默认导航。
   * 同节内重复点击则走默认行为（回到列表/临时对话）。
   */
  const handleSectionSwitch = useCallback(
    (targetSection: SectionKey, defaultAction: () => void) => {
      const currentSection = detectCurrentSection(getAppState())
      if (currentSection === targetSection) {
        defaultAction()
        return
      }
      if (currentSection) {
        useSectionSnapshot.getState().saveSnapshot(currentSection, captureCurrentViewSnapshot())
      }
      const savedSnapshot = useSectionSnapshot.getState().getSnapshot(targetSection)
      if (savedSnapshot) {
        restoreViewSnapshot(savedSnapshot)
      } else {
        defaultAction()
      }
    },
    [],
  )

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
        <SidebarMenu ref={contentMenuRef} className="relative items-center gap-1 px-1.5">
          <SlidingIndicator activeIdx={activeContentIdx} containerRef={contentMenuRef} />
          {/* Core */}
          <IconNavItem
            icon={Sparkles}
            tooltip={t("aiAssistant")}
            color="black"
            isActive={isAiActive}
            onClick={() => handleSectionSwitch('chat', nav.openTempChat)}
          />
          <IconNavItem
            icon={Palette}
            tooltip={t("smartCanvas")}
            color="black"
            isActive={isCanvasActive}
            onClick={() => handleSectionSwitch('canvas', () => openPrimaryPageTab({ ...CANVAS_LIST_TAB_INPUT }))}
          />
          <IconNavItem
            icon={FolderClosed}
            tooltip={t("sidebarProjectSpace")}
            color="black"
            isActive={isProjectActive}
            onClick={() => handleSectionSwitch('project', () => openPrimaryPageTab({ ...PROJECT_LIST_TAB_INPUT }))}
          />

          {/* Separator */}
          <div className="my-1 h-px w-6 bg-sidebar-border" />

          {/* Tools */}
          <IconNavItem
            icon={LayoutDashboard}
            tooltip={t("workbench")}
            color="black"
            isActive={!isInProject && (isWorkbenchActive || isMenuActive(WORKBENCH_TAB_INPUT))}
            onClick={() => openPrimaryPageTab({ ...WORKBENCH_TAB_INPUT })}
          />
          <IconNavItem
            icon={CalendarDays}
            tooltip={t("calendar")}
            color="black"
            isActive={!isInProject && isCalendarActive}
            onClick={() =>
              openPrimaryPageTab({ baseId: "base:calendar", component: "calendar-page", titleKey: "nav:calendar", icon: "🗓️" })
            }
          />
          <IconNavItem
            icon={Mail}
            tooltip={t("email")}
            color="black"
            isActive={!isInProject && isEmailActive}
            onClick={() =>
              openPrimaryPageTab({ baseId: "base:mailbox", component: "email-page", titleKey: "nav:email", icon: "📧" })
            }
          />
          <IconNavItem
            icon={Clock}
            tooltip={t("tasks")}
            color="black"
            isActive={!isInProject && isTasksActive}
            onClick={() =>
              openPrimaryPageTab({ baseId: "base:scheduled-tasks", component: "scheduled-tasks-page", titleKey: "nav:tasks", icon: "⏰" })
            }
          />
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="items-center px-0 py-2 gap-1">
        <SidebarMenu ref={footerMenuRef} className="relative items-center gap-1 px-1.5">
          <SlidingIndicator activeIdx={activeFooterIdx} containerRef={footerMenuRef} />
          <IconNavItem
            icon={Search}
            tooltip={`${t("search")} (⌘K)`}
            color="black"
            onClick={() => setSearchOpen(true)}
          />
          <IconNavItem
            icon={Bot}
            tooltip={t("agents")}
            color="black"
            isActive={!isInProject && isAgentsActive}
            onClick={() => openPrimaryPageTab({ ...AGENTS_TAB_INPUT, preserveCurrentView: true })}
          />
          <IconNavItem
            icon={Wand2}
            tooltip={t("skills")}
            color="black"
            isActive={!isInProject && isSkillsActive}
            onClick={() => openPrimaryPageTab({ ...SKILLS_TAB_INPUT, preserveCurrentView: true })}
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
                preserveCurrentView: true,
              });
            }}
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
