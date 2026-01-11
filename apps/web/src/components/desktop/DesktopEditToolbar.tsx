"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { desktopWidgetCatalog } from "./widget-catalog";
import type { DesktopItem } from "./types";
import {
  DESKTOP_WIDGET_SELECTED_EVENT,
  type DesktopWidgetSelectedDetail,
} from "./DesktopWidgetLibraryPanel";

// 组件库面板标识。
const DESKTOP_WIDGET_LIBRARY_COMPONENT = "desktop-widget-library";
// 组件库面板 ID。
const DESKTOP_WIDGET_LIBRARY_PANEL_ID = "desktop-widget-library";

/** Build a new widget item based on catalog metadata. */
function createWidgetItem(widgetKey: DesktopWidgetSelectedDetail["widgetKey"], items: DesktopItem[]) {
  const catalogItem = desktopWidgetCatalog.find((item) => item.widgetKey === widgetKey);
  if (!catalogItem) return null;

  const { constraints } = catalogItem;
  // 逻辑：追加到当前内容底部，避免覆盖已存在的组件。
  const maxY = items.reduce((acc, item) => Math.max(acc, item.layout.y + item.layout.h), 0);

  return {
    id: `w-${widgetKey}-${Date.now()}`,
    kind: "widget" as const,
    title: catalogItem.title,
    widgetKey: catalogItem.widgetKey,
    size: catalogItem.size,
    constraints,
    layout: { x: 0, y: maxY, w: constraints.defaultW, h: constraints.defaultH },
  };
}

export interface DesktopEditToolbarProps {
  /** Mount point for header controls. */
  controlsTarget: HTMLDivElement | null;
  /** Whether desktop is in edit mode. */
  editMode: boolean;
  /** Current desktop items. */
  items: DesktopItem[];
  /** Append a new desktop item. */
  onAddItem: (item: DesktopItem) => void;
  /** Compact current layout. */
  onCompact: () => void;
  /** Cancel edits and exit edit mode. */
  onCancel: () => void;
  /** Finish edits and exit edit mode. */
  onDone: () => void;
}

/** Render desktop edit toolbar actions in the header slot. */
export default function DesktopEditToolbar({
  controlsTarget,
  editMode,
  items,
  onAddItem,
  onCompact,
  onCancel,
  onDone,
}: DesktopEditToolbarProps) {
  // 当前激活的 tab。
  const activeTabId = useTabs((s) => s.activeTabId);
  // 打开 stack 面板的方法。
  const pushStackItem = useTabs((s) => s.pushStackItem);

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
      if (activeTabId && detail.tabId !== activeTabId) return;

      const nextItem = createWidgetItem(detail.widgetKey, items);
      if (!nextItem) return;
      onAddItem(nextItem);
    };

    window.addEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    return () => {
      window.removeEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    };
  }, [activeTabId, items, onAddItem]);

  if (!controlsTarget || !editMode) return null;

  return createPortal(
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={handleOpenWidgetLibrary}>
        添加组件
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onCompact}>
        整理
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
        取消
      </Button>
      <Button type="button" variant="default" size="sm" onClick={onDone}>
        完成
      </Button>
    </div>,
    controlsTarget
  );
}
