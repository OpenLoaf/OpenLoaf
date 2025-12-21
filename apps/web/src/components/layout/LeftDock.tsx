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
  fillHeight,
  floating,
  header,
}: {
  tabId: string;
  item: DockItem;
  title: string;
  onClose: () => void;
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
          "flex w-full flex-col bg-background/95 backdrop-blur-sm",
          fillHeight && "h-full"
        )}
      >
        {!customHeader ? (
          <StackHeader
            title={title}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            onClose={canClose ? onClose : undefined}
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

  if (!tab) return null;

  const base = tab.base;
  const stack = tab.stack ?? [];
  const hasBase = Boolean(base);
  const underlay = !hasBase ? stack[0] : undefined;
  const overlayStack = !hasBase ? stack.slice(1) : stack;
  const hasOverlay = overlayStack.length > 0;

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
      <div
        className={cn(
          "h-full w-full p-2 transition-all duration-200",
          hasOverlay && "pointer-events-none select-none blur-sm opacity-80"
        )}
      >
        {base ? (
          renderDockItem(tabId, base)
        ) : underlay ? (
          <PanelFrame
            tabId={tabId}
            item={underlay}
            title={underlay.title ?? getPanelTitle(underlay.component)}
            onClose={() => removeStackItem(tabId, underlay.id)}
            fillHeight
            floating={false}
          />
        ) : null}
      </div>

      {hasOverlay
        ? overlayStack.map((item, index) => {
            const depthFromTop = overlayStack.length - 1 - index;
            const isTop = index === overlayStack.length - 1;
            const opacity = 1 - depthFromTop * 0.12;
            const baseInset = 12;
            const insetStep = 8;
            const inset = baseInset + index * insetStep;
            const topInset = baseInset + 18;
            const top = topInset + index * insetStep;
            const title = item.title ?? getPanelTitle(item.component);

            return (
              <motion.div
                key={item.id}
                className={cn(
                  "absolute",
                  isTop ? "pointer-events-auto" : "pointer-events-none"
                )}
                style={{ zIndex: 10 + index }}
                initial={{
                  opacity: 0,
                  top: top + 10,
                  left: inset,
                  right: inset,
                  bottom: inset,
                }}
                animate={{
                  opacity,
                  top,
                  left: inset,
                  right: inset,
                  bottom: inset,
                }}
                transition={{ duration: 0.15 }}
              >
                <PanelFrame
                  tabId={tabId}
                  item={item}
                  title={title}
                  onClose={() => removeStackItem(tabId, item.id)}
                  fillHeight
                  floating
                />
              </motion.div>
            );
          })
        : null}
    </div>
  );
}
