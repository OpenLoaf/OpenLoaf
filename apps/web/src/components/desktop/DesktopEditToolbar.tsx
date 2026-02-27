/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  PencilLine,
  Plus,
  Box,
  X,
  Check,
} from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { desktopWidgetCatalog } from "./widget-catalog";
import { getWidgetVariantConfig } from "./widget-variants";
import type { DesktopItem, DesktopWidgetItem } from "./types";
import {
  getItemLayoutForBreakpoint,
  getBreakpointConfig,
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
  /** Optional project id that owns the dynamic widget. */
  dynamicProjectId?: string;
};

/** Find the first grid position that can fit a widget of given size. */
function findFirstAvailablePosition(
  items: DesktopItem[],
  breakpoint: DesktopBreakpoint,
  w: number,
  h: number,
): { x: number; y: number } {
  const { columns } = getBreakpointConfig(breakpoint);
  // 逻辑：构建占用网格，逐行扫描寻找第一个可放置位置。
  const occupied = new Set<string>();
  let maxY = 0;
  for (const item of items) {
    const layout = getItemLayoutForBreakpoint(item, breakpoint);
    for (let row = layout.y; row < layout.y + layout.h; row++) {
      for (let col = layout.x; col < layout.x + layout.w; col++) {
        occupied.add(`${col},${row}`);
      }
    }
    maxY = Math.max(maxY, layout.y + layout.h);
  }
  // 逻辑：从 (0,0) 开始逐行扫描，找到第一个能放下 w×h 的空位。
  for (let row = 0; row <= maxY; row++) {
    for (let col = 0; col <= columns - w; col++) {
      let fits = true;
      for (let dy = 0; dy < h && fits; dy++) {
        for (let dx = 0; dx < w && fits; dx++) {
          if (occupied.has(`${col + dx},${row + dy}`)) {
            fits = false;
          }
        }
      }
      if (fits) return { x: col, y: row };
    }
  }
  // 逻辑：没有空位，追加到底部。
  return { x: 0, y: maxY };
}

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
    const pos = findFirstAvailablePosition(items, breakpoint, constraints.defaultW, constraints.defaultH);
    const layout = { x: pos.x, y: pos.y, w: constraints.defaultW, h: constraints.defaultH };
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
  // 逻辑：读取 catalog 默认 variant，使用 variant 约束覆盖默认约束。
  const defaultVariant = catalogItem.defaultVariant;
  const variantConfig = defaultVariant
    ? getWidgetVariantConfig(catalogItem.widgetKey, defaultVariant)
    : undefined;
  const resolvedConstraints = variantConfig?.constraints ?? constraints;
  // 逻辑：Flip Clock 默认展示秒数。
  const flipClock = widgetKey === "flip-clock" ? { showSeconds: true } : undefined;
  // 逻辑：优先寻找网格中的空位，找不到再追加到底部。
  const pos = findFirstAvailablePosition(items, breakpoint, resolvedConstraints.defaultW, resolvedConstraints.defaultH);
  const layout = { x: pos.x, y: pos.y, w: resolvedConstraints.defaultW, h: resolvedConstraints.defaultH };

  const title = options?.title ?? catalogItem.title;

  return {
    id: `w-${widgetKey}-${Date.now()}`,
    kind: "widget" as const,
    title,
    widgetKey: catalogItem.widgetKey,
    size: catalogItem.size,
    constraints: resolvedConstraints,
    variant: defaultVariant,
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
      // 逻辑：从 store 直接读取最新 activeTabId，避免闭包捕获旧值导致跨 tab 事件被拒绝。
      const currentActiveTabId = useTabs.getState().activeTabId;
      if (currentActiveTabId && detail.tabId !== currentActiveTabId) return;

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
  }, [activeBreakpoint, items, onAddItem]);

  if (!controlsTarget) return null;

  // 中文注释：非编辑态在头部展示编辑入口。
  if (!editMode) {
    return createPortal(
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={onEnterEditMode}
        >
          <PencilLine className="size-3.5 text-blue-500" />
          编辑
        </Button>
      </div>,
      controlsTarget
    );
  }

  return createPortal(
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={handleOpenWidgetLibrary}
      >
        <Plus className="size-3.5 text-blue-500" />
        添加组件
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={onCompact}
      >
        <Box className="size-3.5 text-orange-500" />
        整理
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={onCancel}
      >
        <X className="size-3.5 text-red-500" />
        取消
      </Button>
      <Button
        type="button"
        variant="default"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={onDone}
      >
        <Check className="size-3.5 text-emerald-500" />
        完成
      </Button>
    </div>,
    controlsTarget
  );
}
