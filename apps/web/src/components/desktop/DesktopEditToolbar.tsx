"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@tenas-ai/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { desktopWidgetCatalog } from "./widget-catalog";
import type { DesktopItem, DesktopWidgetItem } from "./types";
import {
  createLayoutByBreakpoint,
  getItemLayoutForBreakpoint,
  type DesktopBreakpoint,
} from "./desktop-breakpoints";
import {
  DESKTOP_WIDGET_SELECTED_EVENT,
  type DesktopWidgetSelectedDetail,
} from "./DesktopWidgetLibraryPanel";

// 组件库面板标识。
const DESKTOP_WIDGET_LIBRARY_COMPONENT = "desktop-widget-library";
// 组件库面板 ID。
const DESKTOP_WIDGET_LIBRARY_PANEL_ID = "desktop-widget-library";

type WidgetCreateOptions = {
  /** Optional widget title override. */
  title?: string;
  /** Optional folder uri for 3d-folder widget. */
  folderUri?: string;
  /** Optional web url for web-stack widget. */
  webUrl?: string;
  /** Optional web title for web-stack widget. */
  webTitle?: string;
  /** Optional web description for web-stack widget. */
  webDescription?: string;
  /** Optional web logo path for web-stack widget. */
  webLogo?: string;
  /** Optional web preview path for web-stack widget. */
  webPreview?: string;
  /** Optional web meta status for web-stack widget. */
  webMetaStatus?: DesktopWidgetItem["webMetaStatus"];
  /** Optional dynamic widget id for dynamic widgets. */
  dynamicWidgetId?: string;
};

/** Build a new widget item based on catalog metadata. */
function createWidgetItem(
  widgetKey: DesktopWidgetSelectedDetail["widgetKey"],
  items: DesktopItem[],
  breakpoint: DesktopBreakpoint,
  options?: WidgetCreateOptions
) {
  // Dynamic widgets bypass the catalog.
  if (widgetKey === "dynamic" && options?.dynamicWidgetId) {
    const constraints = { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 4 };
    const maxY = items.reduce((acc, item) => {
      const layout = getItemLayoutForBreakpoint(item, breakpoint);
      return Math.max(acc, layout.y + layout.h);
    }, 0);
    const layout = { x: 0, y: maxY, w: constraints.defaultW, h: constraints.defaultH };
    return {
      id: `w-dynamic-${Date.now()}`,
      kind: "widget" as const,
      title: options.title || options.dynamicWidgetId,
      widgetKey: "dynamic" as const,
      size: "4x2" as const,
      constraints,
      dynamicWidgetId: options.dynamicWidgetId,
      layout,
      layoutByBreakpoint: createLayoutByBreakpoint(layout),
    };
  }

  const catalogItem = desktopWidgetCatalog.find((item) => item.widgetKey === widgetKey);
  if (!catalogItem) return null;

  const { constraints } = catalogItem;
  // 逻辑：追加到当前内容底部，避免覆盖已存在的组件。
  const maxY = items.reduce((acc, item) => {
    const layout = getItemLayoutForBreakpoint(item, breakpoint);
    return Math.max(acc, layout.y + layout.h);
  }, 0);
  // 逻辑：Flip Clock 默认展示秒数。
  const flipClock = widgetKey === "flip-clock" ? { showSeconds: true } : undefined;
  const layout = { x: 0, y: maxY, w: constraints.defaultW, h: constraints.defaultH };

  const title = options?.title ?? catalogItem.title;

  return {
    id: `w-${widgetKey}-${Date.now()}`,
    kind: "widget" as const,
    title,
    widgetKey: catalogItem.widgetKey,
    size: catalogItem.size,
    constraints,
    flipClock,
    folderUri: widgetKey === "3d-folder" ? options?.folderUri : undefined,
    webUrl: widgetKey === "web-stack" ? options?.webUrl : undefined,
    webTitle: widgetKey === "web-stack" ? options?.webTitle : undefined,
    webDescription: widgetKey === "web-stack" ? options?.webDescription : undefined,
    webLogo: widgetKey === "web-stack" ? options?.webLogo : undefined,
    webPreview: widgetKey === "web-stack" ? options?.webPreview : undefined,
    webMetaStatus: widgetKey === "web-stack" ? options?.webMetaStatus : undefined,
    layout,
    layoutByBreakpoint: createLayoutByBreakpoint(layout),
  };
}

export interface DesktopEditToolbarProps {
  /** Mount point for header controls. */
  controlsTarget: HTMLDivElement | null;
  /** Whether desktop is in edit mode. */
  editMode: boolean;
  /** Current edit breakpoint. */
  activeBreakpoint: DesktopBreakpoint;
  /** Current desktop items. */
  items: DesktopItem[];
  /** Update breakpoint selection. */
  onChangeBreakpoint: (breakpoint: DesktopBreakpoint) => void;
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
  activeBreakpoint,
  items,
  onChangeBreakpoint,
  onAddItem,
  onCompact,
  onCancel,
  onDone,
}: DesktopEditToolbarProps) {
  // 当前激活的 tab。
  const activeTabId = useTabs((s) => s.activeTabId);
  // 打开 stack 面板的方法。
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);

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

      const nextItem = createWidgetItem(detail.widgetKey, items, activeBreakpoint, {
        title: detail.title,
        folderUri: detail.folderUri,
        webUrl: detail.webUrl,
        webTitle: detail.webTitle,
        webDescription: detail.webDescription,
        webLogo: detail.webLogo,
        webPreview: detail.webPreview,
        webMetaStatus: detail.webMetaStatus,
        dynamicWidgetId: detail.dynamicWidgetId,
      });
      if (!nextItem) return;
      onAddItem(nextItem);
    };

    window.addEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    return () => {
      window.removeEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    };
  }, [activeBreakpoint, activeTabId, items, onAddItem]);

  if (!controlsTarget || !editMode) return null;

  return createPortal(
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
        <Button
          type="button"
          variant={activeBreakpoint === "sm" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChangeBreakpoint("sm")}
        >
          小屏
        </Button>
        <Button
          type="button"
          variant={activeBreakpoint === "md" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChangeBreakpoint("md")}
        >
          中屏
        </Button>
        <Button
          type="button"
          variant={activeBreakpoint === "lg" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChangeBreakpoint("lg")}
        >
          大屏
        </Button>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={handleOpenWidgetLibrary}
      >
        添加组件
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onCompact}
      >
        整理
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onCancel}
      >
        取消
      </Button>
      <Button type="button" variant="default" size="sm" className="h-7 px-2 text-xs" onClick={onDone}>
        完成
      </Button>
    </div>,
    controlsTarget
  );
}
