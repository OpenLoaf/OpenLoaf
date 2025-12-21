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

type MockWebContentsView = {
  id: number;
  tabId: string;
  title: string;
  url: string;
};

const FALLBACK_TABS = [
  { id: "tab_mock_1", title: "标签页 1", icon: "bot" },
  { id: "tab_mock_2", title: "标签页 2", icon: "bot" },
] as const;

const FALLBACK_WEB_CONTENTS_VIEWS: Omit<MockWebContentsView, "tabId">[] = [
  { id: 1, title: "Home", url: "https://teatime.local/" },
  { id: 2, title: "Workspace", url: "https://teatime.local/workspace" },
  { id: 3, title: "Settings", url: "https://teatime.local/settings" },
];

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

/** Renders a tab-like trigger that previews mock WebContentsView entries. */
export const WebContentsViewButton = () => {
  const [open, setOpen] = React.useState(false);
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabs = useTabs((s) => s.tabs);

  // 先做 UI 设计：用 tabs store 来区分“当前标签页/其他标签页”，列表内容暂用 mock 数据。
  const effectiveTabs = tabs.length > 0 ? tabs : FALLBACK_TABS;
  const effectiveActiveTabId = activeTabId ?? effectiveTabs[0]?.id ?? null;

  const tabById = React.useMemo(() => {
    return new Map(effectiveTabs.map((tab) => [tab.id, tab]));
  }, [effectiveTabs]);

  const [currentTabViews, otherTabViews] = React.useMemo(() => {
    const currentTab =
      effectiveTabs.find((tab) => tab.id === effectiveActiveTabId) ??
      effectiveTabs[0];
    if (!currentTab) return [[], []] as const;

    const otherTabs = effectiveTabs.filter((tab) => tab.id !== currentTab.id);
    const current = FALLBACK_WEB_CONTENTS_VIEWS.slice(0, 2).map((view) => ({
      ...view,
      tabId: currentTab.id,
    }));

    const others = FALLBACK_WEB_CONTENTS_VIEWS.slice(2).map((view, index) => {
      const targetTab =
        otherTabs[index % Math.max(1, otherTabs.length)] ?? currentTab;
      return { ...view, tabId: targetTab.id };
    });

    return [current, others] as const;
  }, [effectiveActiveTabId, effectiveTabs]);

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
        <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">
          当前打开的网页（模拟）
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-2" />
        <div className="space-y-1">
          {/* 先做 UI 设计：这里暂不接入 Electron WebContentsView 的真实数据与切换逻辑 */}
          {currentTabViews.map((view) => {
            return (
              <DropdownMenuItem
                key={`current:${view.id}`}
                className="rounded-lg"
                onSelect={(event) => {
                  // 先做 UI 设计：暂不切换/激活
                  event.preventDefault();
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
                    key={`other:${view.id}`}
                    className="rounded-lg"
                    onSelect={(event) => {
                      // 先做 UI 设计：暂不切换/激活
                      event.preventDefault();
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
