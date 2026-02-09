"use client";

import { startTransition, useCallback } from "react";
import { useQuery, skipToken } from "@tanstack/react-query";
import Image from "next/image";
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
} from "@tenas-ai/ui/sidebar";
import { CalendarDays, Inbox, LayoutTemplate, Mail, Search, Wand2 } from "lucide-react";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Search as SearchDialog } from "@/components/search/Search";
import { Kbd, KbdGroup } from "@tenas-ai/ui/kbd";
import { WORKBENCH_TAB_INPUT } from "@tenas-ai/api/common";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { useIsNarrowScreen } from "@/hooks/use-mobile";
import { trpc } from "@/utils/trpc";
import { Badge } from "@tenas-ai/ui/calendar/components/ui/badge";

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { workspace: activeWorkspace } = useWorkspace();
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId);
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
              className="group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
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
              tooltip="日历"
              className="group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              isActive={isMenuActive({
                baseId: "base:calendar",
                component: "calendar-page",
                title: "日历",
              })}
              onClick={() =>
                openSingletonTab({
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
              className="group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              isActive={isMenuActive({
                baseId: "base:mailbox",
                component: "email-page",
                title: "邮箱",
              })}
              onClick={() =>
                openSingletonTab({
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
              tooltip="技能"
              className="group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              isActive={isMenuActive({
                baseId: "base:skills",
                component: "skills-page",
                title: "技能",
              })}
              onClick={() =>
                openSingletonTab({
                  baseId: "base:skills",
                  component: "skills-page",
                  title: "技能",
                  icon: "🪄",
                })
              }
              type="button"
            >
              <Wand2 />
              <span className="flex-1 truncate">技能</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="工作台"
              className="group/menu-item sidebar-menu-icon-tilt text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              isActive={isMenuActive(WORKBENCH_TAB_INPUT)}
              onClick={() => openSingletonTab(WORKBENCH_TAB_INPUT)}
              type="button"
            >
              <Image src="/head_s.png" alt="" width={16} height={16} className="h-4 w-4" />
              <span className="flex-1 truncate">工作台</span>
              <span className="ml-auto opacity-0 transition-opacity delay-0 group-hover/menu-item:opacity-100 group-hover/menu-item:delay-200 group-focus-visible/menu-item:opacity-100 group-focus-visible/menu-item:delay-200 group-data-[collapsible=icon]:hidden">
                <KbdGroup className="gap-1">
                  <Kbd className="bg-transparent px-0 h-auto rounded-none">⌘</Kbd>
                  <Kbd className="bg-transparent px-0 h-auto rounded-none">T</Kbd>
                </KbdGroup>
              </span>
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
