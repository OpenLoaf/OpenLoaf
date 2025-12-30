"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ComponentMap, getPanelTitle } from "@/utils/panel-utils";
import { useTabs } from "@/hooks/use-tabs";
import type { DockItem } from "@teatime-ai/api/common";
import { StackHeader } from "./StackHeader";
import { Skeleton } from "@/components/ui/skeleton";

/** Returns true when the event target is an editable element. */
function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.getAttribute("role") === "textbox"
  );
}

/**
 * Fallback UI while lazy-loaded panels are initializing.
 */
function PanelFallback() {
  return (
    <div className="h-full w-full p-3">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-[40%]" />
        <Skeleton className="h-4 w-[72%]" />
        <Skeleton className="h-4 w-[56%]" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

function renderDockItem(tabId: string, item: DockItem, refreshKey = 0) {
  const Component = ComponentMap[item.component];
  if (!Component) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Component not found: {item.component}
      </div>
    );
  }

  // __refreshKey：用于外部触发“强制刷新面板”（改变 key -> remount）
  const derivedRefreshKey =
    refreshKey > 0
      ? refreshKey
      : Number((item.params as any)?.__refreshKey ?? 0);

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="h-full w-full min-w-0"
    >
      {/* 懒加载的面板通过 Suspense 隔离，避免阻塞其他区域渲染。 */}
      <React.Suspense fallback={<PanelFallback />}>
        <Component
          key={derivedRefreshKey > 0 ? `${item.id}-${derivedRefreshKey}` : undefined}
          panelKey={item.id}
          tabId={tabId}
          {...(item.params ?? {})}
        />
      </React.Suspense>
    </motion.div>
  );
}

function PanelFrame({
  tabId,
  item,
  title,
  onClose,
  onMinimize,
  fillHeight,
  floating,
  header,
}: {
  tabId: string;
  item: DockItem;
  title: string;
  onClose: () => void;
  onMinimize?: () => void;
  fillHeight: boolean;
  floating: boolean;
  header?: React.ReactNode;
}) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const canClose = item.denyClose !== true;
  const customHeader = Boolean((item.params as any)?.__customHeader);

  return (
    <div
      className={cn(
        "overflow-hidden",
        floating
          ? "rounded-xl border border-border shadow-2xl"
          : "rounded-none border-0 shadow-none",
        fillHeight && "h-full w-full"
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col bg-background/95 backdrop-blur-sm pt-2 rounded-xl",
          fillHeight && "h-full"
        )}
      >
        {!customHeader ? (
          <StackHeader
            title={title}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            onClose={canClose ? onClose : undefined}
            showMinimize
            onMinimize={onMinimize}
          >
            {header}
          </StackHeader>
        ) : null}

        <div
          className={cn(
            customHeader ? "p-0" : "p-2",
            fillHeight && "min-h-0 flex-1",
            "min-w-0"
          )}
        >
          {renderDockItem(tabId, item, refreshKey)}
        </div>
      </div>
    </div>
  );
}

// Render the left dock contents for a tab.
export function LeftDock({ tabId }: { tabId: string }) {
  const tab = useTabs((s) => s.tabs.find((t) => t.id === tabId));
  const stackHidden = useTabs((s) => Boolean(s.stackHiddenByTabId[tabId]));
  const activeStackItemId = useTabs((s) => s.activeStackItemIdByTabId[tabId]);
  const removeStackItem = useTabs((s) => s.removeStackItem);
  const setStackHidden = useTabs((s) => s.setStackHidden);

  if (!tab) return null;
  // 只订阅面板渲染必需字段，避免切换 tab 时触发无关渲染。
  const base = tab.base;
  const stack = tab.stack ?? [];
  // stack 的选中态不再依赖“最后一个=顶部”，而是由 activeStackItemIdByTabId 决定。
  const activeStackId = activeStackItemId || stack.at(-1)?.id || "";
  const hasOverlay = Boolean(base) && stack.length > 0 && !stackHidden;
  const floating = Boolean(base);

  React.useEffect(() => {
    if (stack.length === 0) return;
    if (stackHidden) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      if (isEditableTarget(event.target)) return;
      const targetId = activeStackId || stack.at(-1)?.id;
      if (!targetId) return;
      // 中文注释：按下 ESC 时关闭当前 stack 面板。
      event.preventDefault();
      removeStackItem(tabId, targetId);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [stack.length, stackHidden, tabId, activeStackId, removeStackItem]);

  return (
    <div
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
      data-allow-context-menu
    >
      <div
        className={cn(
          "h-full w-full p-2 transition-all duration-200",
          "min-w-0",
          hasOverlay && "pointer-events-none select-none blur-sm opacity-80"
        )}
      >
        {base ? renderDockItem(tabId, base) : null}
      </div>

      {stack.length > 0 ? (
        <div
          className={cn(
            "absolute inset-0",
            // stack 最小化后仍保持挂载（便于恢复状态），但不能挡住 base 的点击/交互。
            stackHidden && "pointer-events-none",
          )}
          style={{ zIndex: 20 }}
          aria-hidden={stackHidden}
        >
          {stack.map((item) => {
            const visible = !stackHidden && item.id === activeStackId;
            return (
              <div
                key={item.id}
                // stack 不再堆叠，只显示一个；其它 stack 保持挂载但隐藏，便于通过 Header 右上角按钮切换。
                className={cn("absolute inset-0 px-5 pt-8 pb-4", !visible && "hidden")}
              >
                <PanelFrame
                  tabId={tabId}
                  item={item}
                  title={item.title ?? getPanelTitle(item.component)}
                  onClose={() => removeStackItem(tabId, item.id)}
                  onMinimize={() => setStackHidden(tabId, true)}
                  fillHeight
                  floating={floating}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
