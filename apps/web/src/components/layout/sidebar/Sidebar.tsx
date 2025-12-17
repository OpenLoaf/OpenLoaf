"use client";

import { useCallback, useEffect, useState } from "react";
import { SidebarPage } from "@/components/layout/sidebar/Page";
import { SidebarWorkspace } from "../../workspace/SidebarWorkspace";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/animate-ui/components/radix/sidebar";
import { CalendarDays, Inbox, Search, Sparkles } from "lucide-react";
import { useTabs } from "@/hooks/use-tabs";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Search as SearchDialog } from "@/components/search/Search";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { DEFAULT_TAB_INFO } from "@teatime-ai/api/common/tabs/types";

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const { workspace: activeWorkspace } = useWorkspace();
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const [searchOpen, setSearchOpen] = useState(false);

  const openSingletonTab = useCallback(
    (input: { baseId: string; component: string; title: string; icon: string }) => {
      if (!activeWorkspace) return;

      const state = useTabs.getState();
      const existing = state.tabs.find(
        (tab) =>
          tab.workspaceId === activeWorkspace.id && tab.base?.id === input.baseId,
      );
      if (existing) {
        setActiveTab(existing.id);
        return;
      }

      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        title: input.title,
        icon: input.icon,
        base: input.component === 'ai-chat' ?  undefined:{ id: input.baseId, component: input.component },
      });
    },
    [activeWorkspace, addTab, setActiveTab],
  );

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return target.isContentEditable;
    };

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;

      const withMod = event.metaKey || event.ctrlKey;
      if (!withMod) return;

      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }

      if (key === "1") {
        event.preventDefault();
        setSearchOpen(false);
        openSingletonTab({
          baseId: "base:calendar",
          component: "calendar-page",
          title: "日历",
          icon: "🗓️",
        });
        return;
      }

      if (key === "2") {
        event.preventDefault();
        setSearchOpen(false);
        openSingletonTab({
          baseId: "base:inbox",
          component: "inbox-page",
          title: "收集箱",
          icon: "📥",
        });
        return;
      }

      if (key === "3") {
        event.preventDefault();
        setSearchOpen(false);
        openSingletonTab({
          baseId: "base:ai-chat",
          component: "ai-chat",
          title: "AI助手",
          icon: "✨",
        });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSingletonTab]);

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
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search />
              <span className="flex-1 truncate">搜索</span>
              <span className="ml-auto group-data-[collapsible=icon]:hidden">
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="日历"
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
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
              <span className="ml-auto group-data-[collapsible=icon]:hidden">
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>1</Kbd>
                </KbdGroup>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="AI"
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
              onClick={() =>
                openSingletonTab({
                  baseId: "base:ai-chat",
                  component: "ai-chat",
                  title: DEFAULT_TAB_INFO.title,
                  icon: DEFAULT_TAB_INFO.icon,
                })
              }
              type="button"
            >
              <Sparkles />
              <span className="flex-1 truncate">AI助手</span>
              <span className="ml-auto group-data-[collapsible=icon]:hidden">
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>3</Kbd>
                </KbdGroup>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="收集箱"
              className="text-sidebar-foreground/80 [&>svg]:text-muted-foreground"
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
              <span className="ml-auto group-data-[collapsible=icon]:hidden">
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>2</Kbd>
                </KbdGroup>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarPage />
      </SidebarContent>
    </Sidebar>
  );
};
