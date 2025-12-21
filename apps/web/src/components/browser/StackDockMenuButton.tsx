"use client";

import { Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPanelTitle } from "@/utils/panel-utils";
import { BROWSER_WINDOW_COMPONENT, useTabs } from "@/hooks/use-tabs";
import type { DockItem } from "@teatime-ai/api/common";

function getStackItemTitle(item: DockItem): string {
  return item.title ?? getPanelTitle(item.component);
}

function destroyBrowserViewsIfNeeded(item: DockItem) {
  if (item.component !== BROWSER_WINDOW_COMPONENT) return;

  const isElectron =
    process.env.NEXT_PUBLIC_ELECTRON === "1" ||
    (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron"));
  if (!isElectron) return;

  const api = window.teatimeElectron;
  if (!api?.destroyWebContentsView) return;

  const tabs = (item.params as any)?.browserTabs;
  if (!Array.isArray(tabs)) return;

  // 中文注释：关闭 browser-window stack 时，销毁所有子标签对应的 WebContentsView。
  for (const t of tabs) {
    const key = String(t?.viewKey ?? "");
    if (!key) continue;
    try {
      void api.destroyWebContentsView(key);
    } catch {
      // ignore
    }
  }
}

export function StackDockMenuButton() {
  const activeTabId = useTabs((s) => s.activeTabId);
  const stack = useTabs((s) => {
    const tab = s.activeTabId ? s.tabs.find((t) => t.id === s.activeTabId) : undefined;
    return tab?.stack ?? [];
  });
  const stackHidden = useTabs((s) =>
    s.activeTabId ? Boolean(s.stackHiddenByTabId[s.activeTabId]) : false,
  );

  if (!activeTabId || stack.length === 0) return null;

  const topId = stack.at(-1)?.id ?? "";

  const openStackItem = (item: DockItem) => {
    // 中文注释：恢复显示并把目标 item 移到顶部（LeftDock 只展示最后一个）。
    useTabs.getState().setStackHidden(activeTabId, false);
    useTabs.getState().pushStackItem(activeTabId, item);
  };

  const closeStackItem = (item: DockItem) => {
    destroyBrowserViewsIfNeeded(item);
    useTabs.getState().removeStackItem(activeTabId, item.id);
    // 中文注释：如果关闭后 stack 为空，自动解除隐藏。
    const nextTab = useTabs.getState().getTabById(activeTabId);
    if ((nextTab?.stack ?? []).length === 0) {
      useTabs.getState().setStackHidden(activeTabId, false);
    }
  };

  const closeAll = () => {
    for (const item of stack) destroyBrowserViewsIfNeeded(item);
    useTabs.getState().clearStack(activeTabId);
    useTabs.getState().setStackHidden(activeTabId, false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-no-drag="true" className="h-8 w-8" variant="ghost" size="icon">
          <Layers className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-[260px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Stack{stackHidden ? "（已最小化）" : ""}
          </span>
          <span className="text-xs text-muted-foreground">{stack.length}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {stack.map((item) => {
          const title = getStackItemTitle(item);
          const isActive = !stackHidden && item.id === topId;
          return (
            <DropdownMenuItem
              key={item.id}
              className="flex items-center justify-between gap-2"
              onSelect={() => openStackItem(item)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={[
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    isActive ? "bg-primary" : "bg-muted-foreground/30",
                  ].join(" ")}
                />
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </div>
              <button
                type="button"
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeStackItem(item);
                }}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="justify-center"
          onSelect={() => closeAll()}
        >
          关闭全部
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
