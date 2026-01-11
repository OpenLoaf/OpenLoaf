"use client";

import * as React from "react";
import DesktopPage, { initialItems } from "@/components/desktop/DesktopPage";
import {
  DESKTOP_WIDGET_SELECTED_EVENT,
  type DesktopWidgetSelectedDetail,
} from "@/components/desktop/DesktopWidgetLibraryPanel";
import { desktopWidgetCatalog } from "@/components/desktop/widget-catalog";
import type { DesktopItem, DesktopWidgetSize } from "@/components/desktop/types";
import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use-tabs";

// 组件库面板标识。
const DESKTOP_WIDGET_LIBRARY_COMPONENT = "desktop-widget-library";
// 组件库面板 ID。
const DESKTOP_WIDGET_LIBRARY_PANEL_ID = "desktop-widget-library";

/** Resolve widget size to grid spans. */
function getWidgetSpan(size: DesktopWidgetSize) {
  if (size === "1x1") return { w: 1, h: 1 };
  if (size === "2x2") return { w: 2, h: 2 };
  return { w: 4, h: 2 };
}

/** Build a new widget item based on catalog metadata. */
function createWidgetItem(widgetKey: DesktopWidgetSelectedDetail["widgetKey"], items: DesktopItem[]) {
  const catalogItem = desktopWidgetCatalog.find((item) => item.widgetKey === widgetKey);
  if (!catalogItem) return null;

  const span = getWidgetSpan(catalogItem.size);
  // 逻辑：追加到当前内容底部，避免覆盖已存在的组件。
  const maxY = items.reduce((acc, item) => Math.max(acc, item.layout.y + item.layout.h), 0);

  return {
    id: `w-${widgetKey}-${Date.now()}`,
    kind: "widget" as const,
    title: catalogItem.title,
    widgetKey: catalogItem.widgetKey,
    size: catalogItem.size,
    layout: { x: 0, y: maxY, w: span.w, h: span.h },
  };
}

/** Render a standalone desktop demo page for UI verification. */
export default function DesktopDemoPage() {
  // 当前桌面组件列表。
  const [items, setItems] = React.useState<DesktopItem[]>(() => initialItems);
  // 是否进入编辑模式。
  const [editMode, setEditMode] = React.useState(false);
  // 编辑前快照，用于取消回滚。
  const snapshotRef = React.useRef<DesktopItem[] | null>(null);
  // 当前激活的 tab。
  const activeTabId = useTabs((s) => s.activeTabId);
  // 打开 stack 面板的方法。
  const pushStackItem = useTabs((s) => s.pushStackItem);

  /** Update edit mode with snapshot handling. */
  const handleSetEditMode = React.useCallback((nextEditMode: boolean) => {
    setEditMode((prev) => {
      if (!prev && nextEditMode) {
        snapshotRef.current = items.map((item) => ({
          ...item,
          layout: { ...item.layout },
        }));
      }
      if (prev && !nextEditMode) snapshotRef.current = null;
      return nextEditMode;
    });
  }, [items]);

  /** Open the desktop widget library stack panel. */
  const handleOpenWidgetLibrary = React.useCallback(() => {
    if (!activeTabId) return;
    pushStackItem(activeTabId, {
      id: DESKTOP_WIDGET_LIBRARY_PANEL_ID,
      sourceKey: DESKTOP_WIDGET_LIBRARY_PANEL_ID,
      component: DESKTOP_WIDGET_LIBRARY_COMPONENT,
      title: "组件库",
    });
  }, [activeTabId, pushStackItem]);

  React.useEffect(() => {
    /** Handle widget selection event from the stack panel. */
    const handleWidgetSelected = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as DesktopWidgetSelectedDetail | undefined;
      if (!detail) return;
      if (!activeTabId || detail.tabId !== activeTabId) return;

      setItems((prev) => {
        const nextItem = createWidgetItem(detail.widgetKey, prev);
        if (!nextItem) return prev;
        return [...prev, nextItem];
      });
    };

    window.addEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    return () => {
      window.removeEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    };
  }, [activeTabId]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-3 py-2">
        <div className="min-w-0 truncate text-sm font-medium">Desktop Demo</div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={handleOpenWidgetLibrary}>
                添加组件
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const snapshot = snapshotRef.current;
                  if (snapshot) setItems(snapshot);
                  snapshotRef.current = null;
                  setEditMode(false);
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => {
                  snapshotRef.current = null;
                  setEditMode(false);
                }}
              >
                完成
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={() => handleSetEditMode(true)}>
              编辑
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DesktopPage
          items={items}
          editMode={editMode}
          onSetEditMode={handleSetEditMode}
          onChangeItems={setItems}
        />
      </div>
    </div>
  );
}
