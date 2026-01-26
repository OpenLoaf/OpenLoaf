"use client";

import * as React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@tenas-ai/ui/command";
import { Kbd, KbdGroup } from "@tenas-ai/ui/kbd";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { AI_CHAT_TAB_INPUT } from "@tenas-ai/api/common";
import { CalendarDays, Inbox, LayoutTemplate, Sparkles } from "lucide-react";

export function Search({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspace: activeWorkspace } = useWorkspace();
  const addTab = useTabs((s) => s.addTab);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const dispatchOverlay = React.useCallback((nextOpen: boolean) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("tenas:overlay", {
        detail: { id: "search", open: nextOpen },
      }),
    );
  }, []);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      dispatchOverlay(nextOpen);
      onOpenChange(nextOpen);
    },
    [dispatchOverlay, onOpenChange],
  );

  const openSingletonTab = React.useCallback(
    (input: { baseId: string; component: string; title: string; icon: string }) => {
      if (!activeWorkspace) return;

      const state = useTabs.getState();
      const existing = state.tabs.find((tab) => {
        if (tab.workspaceId !== activeWorkspace.id) return false;
        if (tab.base?.id === input.baseId) return true;
        // ai-chat 的 base 会在 store 层被归一化为 undefined，因此需要用 title 做单例去重。
        if (input.component === "ai-chat" && !tab.base && tab.title === input.title) return true;
        return false;
      });
      if (existing) {
        React.startTransition(() => {
          setActiveTab(existing.id);
        });
        handleOpenChange(false);
        return;
      }

      addTab({
        workspaceId: activeWorkspace.id,
        createNew: true,
        title: input.title,
        icon: input.icon,
        leftWidthPercent: 70,
        base: {
          id: input.baseId,
          component: input.component,
        },
      });
      handleOpenChange(false);
    },
    [activeWorkspace, addTab, handleOpenChange, setActiveTab],
  );

  React.useEffect(() => {
    dispatchOverlay(open);
    return () => {
      if (open) dispatchOverlay(false);
    };
  }, [dispatchOverlay, open]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="搜索"
      description="搜索并快速打开功能"
      className="top-[25%] translate-y-[-25%]"
      overlayClassName="backdrop-blur-sm bg-black/30"
    >
      <CommandInput placeholder="搜索…" />
      <CommandList>
        <CommandEmpty>暂无结果</CommandEmpty>
        <CommandGroup heading="快速打开">
          <CommandItem
            value="calendar"
            onSelect={() =>
              openSingletonTab({
                baseId: "base:calendar",
                component: "calendar-page",
                title: "日历",
                icon: "🗓️",
              })
            }
          >
            <CalendarDays className="h-5 w-5" />
            <span>日历</span>
            <CommandShortcut>
              <KbdGroup className="gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>L</Kbd>
              </KbdGroup>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            value="inbox"
            onSelect={() =>
              openSingletonTab({
                baseId: "base:inbox",
                component: "inbox-page",
                title: "收集箱",
                icon: "📥",
              })
            }
          >
            <Inbox className="h-5 w-5" />
            <span>收集箱</span>
            <CommandShortcut>
              <KbdGroup className="gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>I</Kbd>
              </KbdGroup>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            value="ai"
            onSelect={() =>
              openSingletonTab(AI_CHAT_TAB_INPUT)
            }
          >
            <Sparkles className="h-5 w-5" />
            <span>AI助手</span>
            <CommandShortcut>
              <KbdGroup className="gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>J</Kbd>
              </KbdGroup>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            value="template"
            onSelect={() =>
              openSingletonTab({
                baseId: "base:template",
                component: "template-page",
                title: "模版",
                icon: "📄",
              })
            }
          >
            <LayoutTemplate className="h-5 w-5" />
            <span>模版</span>
            <CommandShortcut>
              <KbdGroup className="gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>T</Kbd>
              </KbdGroup>
            </CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
