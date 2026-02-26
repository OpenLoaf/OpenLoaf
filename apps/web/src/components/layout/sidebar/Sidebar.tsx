"use client";

import { startTransition, useCallback } from "react";
import { useQuery, skipToken } from "@tanstack/react-query";
import { SidebarProject } from "@/components/layout/sidebar/SidebarProject";
import { SidebarFeedback } from "@/components/layout/sidebar/SidebarFeedback";
import { SidebarWorkspace } from "../../workspace/SidebarWorkspace";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@openloaf/ui/sidebar";
import { CalendarDays, Clock, Inbox, LayoutDashboard, LayoutTemplate, Mail, Search } from "lucide-react";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Search as SearchDialog } from "@/components/search/Search";
import { Kbd, KbdGroup } from "@openloaf/ui/kbd";
import { WORKBENCH_TAB_INPUT } from "@openloaf/api/common";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { useIsNarrowScreen } from "@/hooks/use-mobile";
import { trpc } from "@/utils/trpc";
import { Badge } from "@openloaf/ui/calendar/components/ui/badge";

const SIDEBAR_WORKSPACE_COLOR_CLASS = {
  calendar:
    "group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-sky-700/70 dark:[&>svg]:text-sky-300/70 hover:[&>svg]:text-sky-700 dark:hover:[&>svg]:text-sky-200 data-[active=true]:!bg-sky-500/15 dark:data-[active=true]:!bg-sky-400/20 data-[active=true]:[&>svg]:!text-sky-700 dark:data-[active=true]:[&>svg]:!text-sky-200",
  scheduledTasks:
    "group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-rose-700/70 dark:[&>svg]:text-rose-300/70 hover:[&>svg]:text-rose-700 dark:hover:[&>svg]:text-rose-200 data-[active=true]:!bg-rose-500/15 dark:data-[active=true]:!bg-rose-400/20 data-[active=true]:[&>svg]:!text-rose-700 dark:data-[active=true]:[&>svg]:!text-rose-200",
  email:
    "group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-emerald-700/70 dark:[&>svg]:text-emerald-300/70 hover:[&>svg]:text-emerald-700 dark:hover:[&>svg]:text-emerald-200 data-[active=true]:!bg-emerald-500/15 dark:data-[active=true]:!bg-emerald-400/20 data-[active=true]:[&>svg]:!text-emerald-700 dark:data-[active=true]:[&>svg]:!text-emerald-200",
  workbench:
    "group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-amber-700/70 dark:[&>svg]:text-amber-300/70 hover:[&>svg]:text-amber-700 dark:hover:[&>svg]:text-amber-200 data-[active=true]:!bg-amber-500/15 dark:data-[active=true]:!bg-amber-400/20 data-[active=true]:[&>svg]:!text-amber-700 dark:data-[active=true]:[&>svg]:!text-amber-200",
} as const;

const SIDEBAR_SEARCH_ICON_CLASS =
  "group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-cyan-700/70 dark:[&>svg]:text-cyan-300/70 hover:[&>svg]:text-cyan-700 dark:hover:[&>svg]:text-cyan-200";

const SIDEBAR_WORKSPACE_PAGE_BASE_IDS = new Set([
  WORKBENCH_TAB_INPUT.baseId,
  "base:calendar",
  "base:scheduled-tasks",
  "base:mailbox",
]);

const SIDEBAR_WORKSPACE_PAGE_COMPONENTS = new Set([
  WORKBENCH_TAB_INPUT.component,
  "calendar-page",
  "scheduled-tasks-page",
  "email-page",
]);

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { workspace: activeWorkspace } = useWorkspace();
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const setTabTitle = useTabs((s) => s.setTabTitle);
  const setTabIcon = useTabs((s) => s.setTabIcon);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId);
  const setTabBase = useTabRuntime((s) => s.setTabBase);
  const clearStack = useTabRuntime((s) => s.clearStack);
  const searchOpen = useGlobalOverlay((s) => s.searchOpen);
  const setSearchOpen = useGlobalOverlay((s) => s.setSearchOpen);
  const isNarrow = useIsNarrowScreen(900);
  // 未读邮件数量查询。
  const unreadCountQuery = useQuery(
    trpc.email.listUnreadCount.queryOptions(
      activeWorkspace ? { workspaceId: activeWorkspace.id } : skipToken,
    ),
  );
  // 逻辑：未读数量统一按 workspace 汇总，避免跨账号漏计。
  const unreadCount = unreadCountQuery.data?.count ?? 0;

  // 逻辑：窄屏直接隐藏侧边栏，避免占用可用空间。
  if (isNarrow) return null;

  const activeTab =
    activeWorkspace && activeTabId
      ? tabs.find((tab) => tab.id === activeTabId && tab.workspaceId === activeWorkspace.id)
      : null;
  const activeBaseId = activeTab ? runtimeByTabId[activeTab.id]?.base?.id : undefined;
  // 逻辑：ai-chat 的 base 会在 store 层被归一化为 undefined，需要用 title 兜底。
  const isMenuActive = (input: { baseId?: string; title?: string; component?: string }) => {
    if (!activeTab) return false;
    if (input.baseId && activeBaseId === input.baseId) return true;
    if (input.component === "ai-chat" && !activeBaseId && activeTab.title === input.title) return true;
    return false;
  };


  const openSingletonTab = useCallback(
    (input: { baseId: string; component: string; title: string; icon: string }) => {
      if (!activeWorkspace) return;

      const state = useTabs.getState();
      const runtimeByTabId = useTabRuntime.getState().runtimeByTabId;
      const existing = state.tabs.find((tab) => {
        if (tab.workspaceId !== activeWorkspace.id) return false;
        if (runtimeByTabId[tab.id]?.base?.id === input.baseId) return true;
        // ai-chat 的 base 会在 store 层被归一化为 undefined，因此需要用 title 做单例去重。
        if (input.component === "ai-chat" && !runtimeByTabId[tab.id]?.base && tab.title === input.title) return true;
        return false;
      });
      if (existing) {
        startTransition(() => {
          setActiveTab(existing.id);
        });
        return;
      }

      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        title: input.title,
        icon: input.icon,
        leftWidthPercent: 100,
        base:
          input.component === "ai-chat"
            ? undefined
            : { id: input.baseId, component: input.component },
      });
    },
    [activeWorkspace, addTab, setActiveTab],
  );

  const openWorkspacePageTab = useCallback(
    (input: { baseId: string; component: string; title: string; icon: string }) => {
      if (!activeWorkspace) return;

      const state = useTabs.getState();
      const runtimeState = useTabRuntime.getState().runtimeByTabId;

      const currentTab =
        activeTabId && state.tabs.find((tab) => tab.id === activeTabId && tab.workspaceId === activeWorkspace.id);
      const currentBase = currentTab ? runtimeState[currentTab.id]?.base : undefined;

      const shouldReuseCurrent =
        Boolean(currentTab) &&
        Boolean(currentBase) &&
        SIDEBAR_WORKSPACE_PAGE_BASE_IDS.has(currentBase!.id) &&
        SIDEBAR_WORKSPACE_PAGE_COMPONENTS.has(currentBase!.component);

      if (currentTab && shouldReuseCurrent) {
        // 逻辑：四个主页面复用同一个 tab，仅切换 base 与显示信息。
        setTabBase(currentTab.id, { id: input.baseId, component: input.component });
        clearStack(currentTab.id);
        setTabTitle(currentTab.id, input.title);
        setTabIcon(currentTab.id, input.icon);
        startTransition(() => {
          setActiveTab(currentTab.id);
        });
        return;
      }

      const existingWorkspacePageTab = state.tabs
        .filter((tab) => tab.workspaceId === activeWorkspace.id)
        .filter((tab) => {
          const base = runtimeState[tab.id]?.base;
          if (!base) return false;
          return (
            SIDEBAR_WORKSPACE_PAGE_BASE_IDS.has(base.id) &&
            SIDEBAR_WORKSPACE_PAGE_COMPONENTS.has(base.component)
          );
        })
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];

      if (existingWorkspacePageTab) {
        // 逻辑：若已存在主页面 tab，复用该 tab，避免产生多份同类页面 tab。
        setTabBase(existingWorkspacePageTab.id, { id: input.baseId, component: input.component });
        clearStack(existingWorkspacePageTab.id);
        setTabTitle(existingWorkspacePageTab.id, input.title);
        setTabIcon(existingWorkspacePageTab.id, input.icon);
        startTransition(() => {
          setActiveTab(existingWorkspacePageTab.id);
        });
        return;
      }

      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        title: input.title,
        icon: input.icon,
        leftWidthPercent: 100,
        base: { id: input.baseId, component: input.component },
      });
    },
    [
      activeTabId,
      activeWorkspace,
      addTab,
      clearStack,
      setActiveTab,
      setTabBase,
      setTabIcon,
      setTabTitle,
    ],
  );


  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r-0!"
      {...props}
    >
      <SidebarHeader>
        <SidebarWorkspace />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="搜索"
              className={SIDEBAR_SEARCH_ICON_CLASS}
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search />
              <span className="flex-1 truncate">搜索</span>
              {/* 快捷键提示默认隐藏，仅在 hover / focus 时显示，避免侧边栏视觉噪音。 */}
              <span className="ml-auto opacity-0 transition-opacity delay-0 group-hover/menu-item:opacity-100 group-hover/menu-item:delay-200 group-focus-visible/menu-item:opacity-100 group-focus-visible/menu-item:delay-200 group-data-[collapsible=icon]:hidden">
                <KbdGroup className="gap-1">
                  <Kbd className="bg-transparent px-0 h-auto rounded-none">⌘</Kbd>
                  <Kbd className="bg-transparent px-0 h-auto rounded-none">K</Kbd>
                </KbdGroup>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* 先隐藏模版入口，后续再开放。 */}
          {false ? (
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
              tooltip="工作台"
              className={SIDEBAR_WORKSPACE_COLOR_CLASS.workbench}
              isActive={isMenuActive(WORKBENCH_TAB_INPUT)}
              onClick={() => openWorkspacePageTab(WORKBENCH_TAB_INPUT)}
              type="button"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="flex-1 truncate">工作台</span>
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
              tooltip="日历"
              // 逻辑：与底部 DockTabs 的色调保持一致，增强主入口识别度。
              className={SIDEBAR_WORKSPACE_COLOR_CLASS.calendar}
              isActive={isMenuActive({
                baseId: "base:calendar",
                component: "calendar-page",
                title: "日历",
              })}
              onClick={() =>
                openWorkspacePageTab({
                  baseId: "base:calendar",
                  component: "calendar-page",
                  title: "日历",
                  icon: "🗓️",
                })
              }
              type="button"
            >
              <CalendarDays />
              <span className="flex-1 truncate">日历</span>
              <span className="ml-auto opacity-0 transition-opacity delay-0 group-hover/menu-item:opacity-100 group-hover/menu-item:delay-200 group-focus-visible/menu-item:opacity-100 group-focus-visible/menu-item:delay-200 group-data-[collapsible=icon]:hidden">
                <KbdGroup className="gap-1">
                  <Kbd className="bg-transparent px-0 h-auto rounded-none">⌘</Kbd>
                  <Kbd className="bg-transparent px-0 h-auto rounded-none">L</Kbd>
                </KbdGroup>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="邮箱"
              className={SIDEBAR_WORKSPACE_COLOR_CLASS.email}
              isActive={isMenuActive({
                baseId: "base:mailbox",
                component: "email-page",
                title: "邮箱",
              })}
              onClick={() =>
                openWorkspacePageTab({
                  baseId: "base:mailbox",
                  component: "email-page",
                  title: "邮箱",
                  icon: "📧",
                })
              }
              type="button"
            >
              <Mail />
              <span className="flex-1 truncate">邮箱</span>
              {unreadCount > 0 ? (
                <Badge
                  className="ml-auto min-w-[1.25rem] justify-center px-1.5 py-0.5 text-[10px] leading-[1]"
                  size="sm"
                >
                  {unreadCount}
                </Badge>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="任务"
              className={SIDEBAR_WORKSPACE_COLOR_CLASS.scheduledTasks}
              isActive={isMenuActive({
                baseId: "base:scheduled-tasks",
                component: "scheduled-tasks-page",
                title: "任务",
              })}
              onClick={() =>
                openWorkspacePageTab({
                  baseId: "base:scheduled-tasks",
                  component: "scheduled-tasks-page",
                  title: "任务",
                  icon: "⏰",
                })
              }
              type="button"
            >
              <Clock />
              <span className="flex-1 truncate">任务</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* 先隐藏收集箱入口，后续再开放。 */}
          {false ? (
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
        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarProject />
      </SidebarContent>
      <SidebarFooter>
        <SidebarFeedback />
      </SidebarFooter>
    </Sidebar>
  );
};
