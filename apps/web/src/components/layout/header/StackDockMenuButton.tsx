"use client";

import * as React from "react";
import { motion, useAnimationControls } from "motion/react";
import { Layers, X } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { getPanelTitle } from "@/utils/panel-utils";
import { BROWSER_WINDOW_COMPONENT, type DockItem } from "@openloaf/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { getStackMinimizeSignal } from "@/lib/stack-dock-animation";
import { isElectronEnv } from "@/utils/is-electron-env";

// 保持空数组引用稳定，避免 useSyncExternalStore 报错。
const EMPTY_STACK: DockItem[] = [];

function getStackItemTitle(item: DockItem): string {
  return item.title ?? getPanelTitle(item.component);
}

function destroyBrowserViewsIfNeeded(item: DockItem) {
  if (item.component !== BROWSER_WINDOW_COMPONENT) return;

  const isElectron = isElectronEnv();
  if (!isElectron) return;

  const api = window.openloafElectron;
  if (!api?.destroyWebContentsView) return;

  const tabs = (item.params as any)?.browserTabs;
  if (!Array.isArray(tabs)) return;

  // 关闭 browser-window stack 时，销毁所有子标签对应的 WebContentsView。
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
  const stack = useTabRuntime((s) =>
    activeTabId ? s.runtimeByTabId[activeTabId]?.stack ?? EMPTY_STACK : EMPTY_STACK,
  );
  const activeTabTitle = useTabs((s) => {
    const tab = s.activeTabId ? s.tabs.find((t) => t.id === s.activeTabId) : undefined;
    return String(tab?.title ?? "");
  });
  const activeStackItemId = useTabRuntime((s) =>
    activeTabId ? s.runtimeByTabId[activeTabId]?.activeStackItemId ?? "" : "",
  );
  const stackHidden = useTabRuntime((s) =>
    activeTabId ? Boolean(s.runtimeByTabId[activeTabId]?.stackHidden) : false,
  );
  const nudgeControls = useAnimationControls();
  const lastSignalRef = React.useRef(0);

  React.useEffect(() => {
    if (!activeTabId) return;
    if (!stackHidden) return;
    if (stack.length === 0) return;
    const signal = getStackMinimizeSignal(activeTabId);
    if (!signal || signal === lastSignalRef.current) return;
    lastSignalRef.current = signal;
    void nudgeControls.start({
      rotate: [0, -10, 10, -8, 8, 0],
      x: [0, -2, 2, -1.5, 1.5, 0],
      transition: { duration: 0.48, ease: "easeInOut" },
    });
  }, [activeTabId, nudgeControls, stack.length, stackHidden]);

  if (!activeTabId || stack.length === 0) return null;
  // 只有一个 stack 且正在显示时，不需要入口按钮（避免 UI 冗余）。
  if (!stackHidden && stack.length === 1) return null;

  const topId = activeStackItemId || stack.at(-1)?.id || "";

  const openStackItem = (item: DockItem) => {
    // 恢复显示并切换到目标 item（不再重排 stack 数组）。
    useTabRuntime.getState().pushStackItem(activeTabId, item);
  };

  const closeStackItem = (item: DockItem) => {
    destroyBrowserViewsIfNeeded(item);
    useTabRuntime.getState().removeStackItem(activeTabId, item.id);
    // 如果关闭后 stack 为空，自动解除隐藏。
    const nextRuntime = useTabRuntime.getState().runtimeByTabId[activeTabId];
    if ((nextRuntime?.stack ?? []).length === 0) {
      useTabRuntime.getState().setStackHidden(activeTabId, false);
    }
  };

  const closeAll = () => {
    for (const item of stack) destroyBrowserViewsIfNeeded(item);
    useTabRuntime.getState().clearStack(activeTabId);
    useTabRuntime.getState().setStackHidden(activeTabId, false);
  };

  if (stackHidden && stack.length === 1) {
    // 只有一个 stack item 时，隐藏后点击按钮直接恢复显示，不再弹出列表。
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-no-drag="true"
            className="h-8 w-8"
            variant="ghost"
            size="icon"
            onClick={() => openStackItem(stack[0]!)}
          >
            <motion.span
              className="relative"
              animate={nudgeControls}
              initial={{ rotate: 0, x: 0 }}
            >
              <Layers className="h-4 w-4" />
            </motion.span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          恢复堆栈
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-no-drag="true" className="h-8 w-8" variant="ghost" size="icon">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex h-full w-full items-center justify-center">
                <motion.span
                  className="relative"
                  animate={nudgeControls}
                  initial={{ rotate: 0, x: 0 }}
                >
                  <Layers className="h-4 w-4" />
                  {stack.length > 1 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-primary px-0.5 text-[9px] leading-none text-primary-foreground">
                      {stack.length}
                    </span>
                  ) : null}
                </motion.span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              堆栈菜单
            </TooltipContent>
          </Tooltip>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-[260px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {activeTabTitle || "Stack"}
            {stackHidden ? "（已最小化）" : ""}
          </span>
          <span className="text-xs text-muted-foreground">{stack.length}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {stack.map((item) => {
          const title = getStackItemTitle(item);
          // 以“顶部 item”为选中态；即使处于最小化隐藏，也要保持选中态一致。
          const isTop = item.id === topId;
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
                    isTop ? (stackHidden ? "bg-primary/50" : "bg-primary") : "bg-muted-foreground/30",
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
