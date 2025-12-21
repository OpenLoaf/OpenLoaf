"use client";

import * as React from "react";
import { Bot, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTabs } from "@/hooks/use-tabs";
import type { DockItem } from "@teatime-ai/api/common";

type BrowserView = {
  workspaceId: string;
  tabId: string;
  item: DockItem;
  title: string;
  url: string;
};

/** Renders a compact tab chip aligned with header tab styles. */
const TabChip = ({
  title,
  icon,
}: {
  title: string;
  icon?: string | null;
}) => {
  return (
    <div className="flex h-7 w-28 shrink-0 items-center gap-1 rounded-md bg-sidebar px-2 text-xs text-muted-foreground">
      {icon === "bot" ? (
        <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <div className="min-w-0 flex-1 truncate text-left">
        {title || "Untitled"}
      </div>
    </div>
  );
};

/** Renders a section divider line. */
const SectionDivider = () => {
  return (
    <div className="flex items-center px-2 py-1">
      <div className="h-px w-full bg-sidebar-border" aria-hidden />
    </div>
  );
};

function getDockUrl(item: DockItem): string {
  const url = (item.params as any)?.url;
  return typeof url === "string" ? url : "";
}

function deriveTitle(input: { item: DockItem; url: string }): string {
  if (input.item.title) return input.item.title;
  if (!input.url) return "Untitled";
  try {
    return new URL(input.url).hostname || input.url;
  } catch {
    return input.url;
  }
}

/** Renders a tab-like trigger that previews mock WebContentsView entries. */
export const WebContentsViewButton = ({ workspaceId }: { workspaceId?: string }) => {
  const [open, setOpen] = React.useState(false);
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabs = useTabs((s) => s.tabs);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const pushStackItem = useTabs((s) => s.pushStackItem);

  const [currentTabViews, otherTabViews, tabById] = React.useMemo(() => {
    if (!workspaceId) return [[], [], new Map()] as const;
    const workspaceTabs = tabs.filter((t) => t.workspaceId === workspaceId);
    const map = new Map(workspaceTabs.map((tab) => [tab.id, tab]));

    const views: BrowserView[] = [];
    for (const tab of workspaceTabs) {
      for (const item of tab.stack ?? []) {
        if (item.component !== "electron-browser-window") continue;
        const url = getDockUrl(item);
        views.push({
          workspaceId,
          tabId: tab.id,
          item,
          url,
          title: deriveTitle({ item, url }),
        });
      }
    }

    const current: BrowserView[] = [];
    const others: BrowserView[] = [];
    for (const view of views) {
      if (activeTabId && view.tabId === activeTabId) current.push(view);
      else others.push(view);
    }

    return [current, others, map] as const;
  }, [workspaceId, tabs, activeTabId]);

  const viewCount = currentTabViews.length + otherTabViews.length;
  const displayCount = viewCount > 99 ? "99+" : String(viewCount);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          data-no-drag="true"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 data-[state=open]:bg-sidebar-accent"
          aria-label="WebContentsView list"
        >
          <Layers className="h-4 w-4" />
          <span className="text-muted-foreground ml-1 flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-semibold tabular-nums">
            {displayCount}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-no-drag="true"
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 rounded-xl p-2"
      >
        <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">当前打开的网页</DropdownMenuLabel>
        <DropdownMenuSeparator className="my-2" />
        <div className="space-y-1">
          {viewCount === 0 ? (
            <DropdownMenuItem
              className="rounded-lg text-xs text-muted-foreground"
              disabled
            >
              暂无打开网页
            </DropdownMenuItem>
          ) : null}

          {currentTabViews.map((view) => {
            return (
              <DropdownMenuItem
                key={`current:${view.item.id}`}
                className="rounded-lg"
                onSelect={(event) => {
                  event.preventDefault();
                  // 中文注释：激活对应 tab，并把该网页面板置顶（stack 最后一个）。
                  setActiveTab(view.tabId);
                  pushStackItem(view.tabId, view.item, 70);
                  setOpen(false);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-5">
                    {view.title}
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-4">
                    {view.url}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })}

          {otherTabViews.length > 0 && (
            <>
              <SectionDivider />
              {otherTabViews.map((view) => {
                const tab = tabById.get(view.tabId);
                return (
                  <DropdownMenuItem
                    key={`other:${view.item.id}`}
                    className="rounded-lg"
                    onSelect={(event) => {
                      event.preventDefault();
                      // 中文注释：跨 tab 打开：先切 tab，再把目标网页面板置顶。
                      setActiveTab(view.tabId);
                      pushStackItem(view.tabId, view.item, 70);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-5">
                        {view.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground leading-4">
                        {view.url}
                      </div>
                    </div>
                    <TabChip title={tab?.title ?? "Untitled"} icon={tab?.icon} />
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
