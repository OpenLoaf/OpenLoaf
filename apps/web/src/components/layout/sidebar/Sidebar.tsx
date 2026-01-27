"use client";

import { startTransition, useCallback } from "react";
import { SidebarProject } from "@/components/layout/sidebar/SidebarProject";
import { SidebarWorkspace } from "../../workspace/SidebarWorkspace";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@tenas-ai/ui/sidebar";
import { CalendarDays, Inbox, LayoutTemplate, Search, Sparkles } from "lucide-react";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Search as SearchDialog } from "@/components/search/Search";
import { Kbd, KbdGroup } from "@tenas-ai/ui/kbd";
import { AI_CHAT_TAB_INPUT } from "@tenas-ai/api/common";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { useIsNarrowScreen } from "@/hooks/use-mobile";

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { workspace: activeWorkspace } = useWorkspace();
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const searchOpen = useGlobalOverlay((s) => s.searchOpen);
  const setSearchOpen = useGlobalOverlay((s) => s.setSearchOpen);
  const isNarrow = useIsNarrowScreen(900);

  // 逻辑：窄屏直接隐藏侧边栏，避免占用可用空间。
  if (isNarrow) return null;

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
              className="group/menu-item text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
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
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="模版"
              className="group/menu-item text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
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
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="日历"
              className="group/menu-item text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
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
              tooltip="AI"
              className="group/menu-item text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() => openSingletonTab(AI_CHAT_TAB_INPUT)}
              type="button"
            >
              <Sparkles />
              <span className="flex-1 truncate">AI助手</span>
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
              tooltip="收集箱"
              className="group/menu-item text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
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
        </SidebarMenu>
        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarProject />
      </SidebarContent>
    </Sidebar>
  );
};
