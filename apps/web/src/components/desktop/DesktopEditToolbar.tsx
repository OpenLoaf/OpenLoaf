"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@tenas-ai/ui/button";
import { Toolbar, ToolbarToggleGroup, ToolbarToggleItem } from "@tenas-ai/ui/toolbar";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { desktopWidgetCatalog } from "./widget-catalog";
import type { DesktopItem, DesktopWidgetItem } from "./types";
import {
  getItemLayoutForBreakpoint,
  type DesktopBreakpoint,
  type DesktopBreakpointLock,
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
  /** Optional project id that owns the dynamic widget. */
  dynamicProjectId?: string;
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
      dynamicProjectId: options.dynamicProjectId,
      layout,
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
  };
}

export interface DesktopEditToolbarProps {
  /** Mount point for header controls. */
  controlsTarget: HTMLDivElement | null;
  /** Whether desktop is in edit mode. */
  editMode: boolean;
  /** Current active breakpoint (auto-detected from container width). */
  activeBreakpoint: DesktopBreakpoint;
  /** Breakpoint lock state in edit mode. */
  breakpointLock: DesktopBreakpointLock;
  /** Update breakpoint lock state. */
  onBreakpointLockChange: (value: DesktopBreakpointLock) => void;
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
  /** Enter edit mode from view mode. */
  onEnterEditMode: () => void;
}

/** Render desktop edit toolbar actions in the header slot. */
export default function DesktopEditToolbar({
  controlsTarget,
  editMode,
  activeBreakpoint,
  breakpointLock,
  onBreakpointLockChange,
  items,
  onAddItem,
  onCompact,
  onCancel,
  onDone,
  onEnterEditMode,
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
        dynamicProjectId: detail.dynamicProjectId,
      });
      if (!nextItem) return;
      onAddItem(nextItem);
    };

    window.addEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    return () => {
      window.removeEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    };
  }, [activeBreakpoint, activeTabId, items, onAddItem]);

  if (!controlsTarget) return null;

  // 中文注释：非编辑态在头部展示编辑入口。
  if (!editMode) {
    return createPortal(
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onEnterEditMode}
        >
          编辑
        </Button>
      </div>,
      controlsTarget
    );
  }

  return createPortal(
    <div className="flex items-center gap-2">
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
      {/* 中文注释：编辑态断点锁定，只影响预览宽度。 */}
      <div className="flex items-center rounded-lg border border-border/60 bg-background/70 p-0.5">
        <Toolbar className="rounded-md">
          <ToolbarToggleGroup
            type="single"
            value={breakpointLock}
            className="gap-1"
            onValueChange={(value) => {
              if (!value) return;
              onBreakpointLockChange(value as DesktopBreakpointLock);
            }}
          >
            <ToolbarToggleItem
              value="auto"
              size="sm"
              className="h-7 min-w-10 px-2 text-[11px] text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
            >
              Auto
            </ToolbarToggleItem>
            <ToolbarToggleItem
              value="sm"
              size="sm"
              className="h-7 min-w-8 px-2 text-[11px] text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
            >
              SM
            </ToolbarToggleItem>
            <ToolbarToggleItem
              value="md"
              size="sm"
              className="h-7 min-w-8 px-2 text-[11px] text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
            >
              MD
            </ToolbarToggleItem>
            <ToolbarToggleItem
              value="lg"
              size="sm"
              className="h-7 min-w-8 px-2 text-[11px] text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
            >
              LG
            </ToolbarToggleItem>
          </ToolbarToggleGroup>
        </Toolbar>
      </div>
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
