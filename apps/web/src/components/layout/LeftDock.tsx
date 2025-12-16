"use client";

import * as React from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComponentMap, getPanelTitle } from "@/utils/panel-utils";
import { useTabs } from "@/hooks/use_tabs";
import type { DockItem } from "@teatime-ai/api/types/tabs";

function renderDockItem(tabId: string, item: DockItem) {
  const Component = ComponentMap[item.component];
  if (!Component) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Component not found: {item.component}
      </div>
    );
  }

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="h-full w-full"
    >
      <Component panelKey={item.id} tabId={tabId} {...(item.params ?? {})} />
    </motion.div>
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
    <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden ">
      <div
        className={cn(
          "h-full w-full transition-all duration-200  p-2",
          hasOverlay && "pointer-events-none select-none blur-sm opacity-80",
        )}
      >
        {base ? renderDockItem(tabId, base) : underlay ? (
          renderDockItem(tabId, underlay)
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            No project
          </div>
        )}
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
                  "absolute overflow-hidden rounded-xl border border-border shadow-2xl",
                  isTop ? "pointer-events-auto" : "pointer-events-none",
                )}
                style={{ zIndex: 10 + index, maxHeight: `calc(100% - ${top + baseInset}px)` }}
                initial={{
                  opacity: 0,
                  top: top + 10,
                  left: inset,
                  right: inset,
                }}
                animate={{
                  opacity,
                  top,
                  left: inset,
                  right: inset,
                }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex w-full flex-col bg-background/95 backdrop-blur-sm">
                  <div className="shrink-0 border-b bg-background/70 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 text-sm font-medium">
                        <span className="truncate">{title}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeStackItem(tabId, item.id)}
                          aria-label="Close"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    {renderDockItem(tabId, item)}
                  </div>
                </div>
              </motion.div>
            );
          })
        : null}
    </div>
  );
}
