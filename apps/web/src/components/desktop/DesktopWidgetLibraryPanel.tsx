"use client";

import * as React from "react";
import { useTabs } from "@/hooks/use-tabs";
import { Input } from "@/components/ui/input";
import type { DesktopWidgetItem } from "./types";
import { desktopWidgetCatalog } from "./widget-catalog";
import ClockWidget from "./widgets/ClockWidget";
import FlipClockWidget from "./widgets/FlipClockWidget";
import QuickActionsWidget from "./widgets/QuickActionsWidget";

// 组件选择事件名称。
export const DESKTOP_WIDGET_SELECTED_EVENT = "tenas:desktop-widget-selected";

/** Payload for a desktop widget selection event. */
export type DesktopWidgetSelectedDetail = {
  /** Target tab id to receive the selection. */
  tabId: string;
  /** Widget key to insert. */
  widgetKey: DesktopWidgetItem["widgetKey"];
};

/** Emit a desktop widget selection event (stack -> desktop page bridge). */
function emitDesktopWidgetSelected(detail: DesktopWidgetSelectedDetail) {
  // 逻辑：stack 面板与桌面渲染处于不同的 React 树，使用 CustomEvent 做一次轻量桥接。
  window.dispatchEvent(new CustomEvent<DesktopWidgetSelectedDetail>(DESKTOP_WIDGET_SELECTED_EVENT, { detail }));
}

/** Render a widget entity preview for the catalog grid. */
function WidgetEntityPreview({ widgetKey }: { widgetKey: DesktopWidgetItem["widgetKey"] }) {
  if (widgetKey === "clock") return <ClockWidget />;
  if (widgetKey === "flip-clock") return <FlipClockWidget />;
  if (widgetKey === "quick-actions") return <QuickActionsWidget />;
  return <div className="text-sm text-muted-foreground">Widget</div>;
}

export interface DesktopWidgetLibraryPanelProps {
  /** Panel identity from DockItem.id. */
  panelKey: string;
  /** Current tab id (used for event targeting and closing the stack item). */
  tabId: string;
}

/**
 * Render a desktop widget library for insertion (stack panel).
 */
export default function DesktopWidgetLibraryPanel({
  panelKey,
  tabId,
}: DesktopWidgetLibraryPanelProps) {
  // 当前 tab 的 stack 删除方法。
  const removeStackItem = useTabs((s) => s.removeStackItem);
  // 过滤关键字。
  const [query, setQuery] = React.useState("");

  // 过滤后的组件列表。
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return desktopWidgetCatalog;
    return desktopWidgetCatalog.filter((item) => item.title.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col gap-3 p-3">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索组件…" />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.widgetKey}
              role="button"
              tabIndex={0}
              className="group flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-background p-3 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => {
                emitDesktopWidgetSelected({ tabId, widgetKey: item.widgetKey });
                removeStackItem(tabId, panelKey);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                emitDesktopWidgetSelected({ tabId, widgetKey: item.widgetKey });
                removeStackItem(tabId, panelKey);
              }}
            >
              <div className="pointer-events-none h-36 overflow-hidden rounded-lg border border-border bg-card p-3">
                <WidgetEntityPreview widgetKey={item.widgetKey} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.title}</div>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              没有匹配的组件
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
