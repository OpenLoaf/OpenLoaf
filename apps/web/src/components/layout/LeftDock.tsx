"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ComponentMap, getPanelTitle } from "@/utils/panel-utils";
import { useTabs } from "@/hooks/use-tabs";
import type { DockItem } from "@teatime-ai/api/common";
import { StackHeader } from "./StackHeader";

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
      className="h-full w-full"
    >
      <Component
        key={derivedRefreshKey > 0 ? `${item.id}-${derivedRefreshKey}` : undefined}
        panelKey={item.id}
        tabId={tabId}
        {...(item.params ?? {})}
      />
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
          "flex w-full flex-col bg-background/95 backdrop-blur-sm pt-2",
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

        <div className={cn(customHeader ? "p-0" : "p-2", fillHeight && "min-h-0 flex-1")}>
          {renderDockItem(tabId, item, refreshKey)}
        </div>
      </div>
    </div>
  );
}

export function LeftDock({ tabId }: { tabId: string }) {
  const tab = useTabs((s) => s.tabs.find((t) => t.id === tabId));
  const removeStackItem = useTabs((s) => s.removeStackItem);
  const stackHidden = useTabs((s) => Boolean(s.stackHiddenByTabId[tabId]));
  const activeStackItemId = useTabs((s) => s.activeStackItemIdByTabId[tabId]);
  const setStackHidden = useTabs((s) => s.setStackHidden);

  if (!tab) return null;

  const base = tab.base;
  const stack = tab.stack ?? [];
  // 中文注释：stack 的选中态不再依赖“最后一个=顶部”，而是由 activeStackItemIdByTabId 决定。
  const activeStackId = activeStackItemId || stack.at(-1)?.id || "";
  const hasOverlay = Boolean(base) && stack.length > 0 && !stackHidden;
  const floating = Boolean(base);

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
      <div
        className={cn(
          "h-full w-full p-2 transition-all duration-200",
          hasOverlay && "pointer-events-none select-none blur-sm opacity-80"
        )}
      >
        {base ? renderDockItem(tabId, base) : null}
      </div>

      {stack.length > 0 ? (
        <div
          className={cn(
            "absolute inset-0",
            // 中文注释：stack 最小化后仍保持挂载（便于恢复状态），但不能挡住 base 的点击/交互。
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
                // 中文注释：stack 不再堆叠，只显示一个；其它 stack 保持挂载但隐藏，便于通过 Header 右上角按钮切换。
                className={cn("absolute inset-0 p-2", !visible && "hidden")}
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
