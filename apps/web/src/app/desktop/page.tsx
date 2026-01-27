"use client";

import * as React from "react";
import DesktopPage, { initialItems } from "@/components/desktop/DesktopPage";
import {
  DESKTOP_WIDGET_SELECTED_EVENT,
  type DesktopWidgetSelectedDetail,
} from "@/components/desktop/DesktopWidgetLibraryPanel";
import { desktopWidgetCatalog } from "@/components/desktop/widget-catalog";
import type { DesktopBreakpoint } from "@/components/desktop/desktop-breakpoints";
import type { DesktopItem } from "@/components/desktop/types";
import { Button } from "@tenas-ai/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { areDesktopItemsEqual, cloneDesktopItems } from "@/components/desktop/desktop-history";

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
  // 逻辑：Flip Clock 默认展示秒数。
  const flipClock = widgetKey === "flip-clock" ? { showSeconds: true } : undefined;

  return {
    id: `w-${widgetKey}-${Date.now()}`,
    kind: "widget" as const,
    title: catalogItem.title,
    widgetKey: catalogItem.widgetKey,
    size: catalogItem.size,
    constraints,
    flipClock,
    layout: { x: 0, y: maxY, w: constraints.defaultW, h: constraints.defaultH },
  };
}

/** Render a standalone desktop demo page for UI verification. */
export default function DesktopDemoPage() {
  // 当前桌面组件列表。
  const [items, setItems] = React.useState<DesktopItem[]>(() => initialItems);
  // 是否进入编辑模式。
  const [editMode, setEditMode] = React.useState(false);
  // 放置模式下的目标组件 id。
  const [placementItemId, setPlacementItemId] = React.useState<string | null>(null);
  // 放置模式下的起始指针坐标。
  const [placementPointer, setPlacementPointer] = React.useState<{ clientX: number; clientY: number } | null>(null);
  // 当前断点。
  const [activeBreakpoint, setActiveBreakpoint] = React.useState<DesktopBreakpoint>("lg");
  // 触发整理布局的信号。
  const [compactSignal, setCompactSignal] = React.useState(0);
  // 编辑前快照，用于取消回滚。
  const snapshotRef = React.useRef<DesktopItem[] | null>(null);
  // 历史栈快照，用于撤回与前进。
  const historyRef = React.useRef({
    past: [] as DesktopItem[][],
    future: [] as DesktopItem[][],
    suspended: false,
  });
  // 当前激活的 tab。
  const activeTabId = useTabs((s) => s.activeTabId);
  // 打开 stack 面板的方法。
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);

  /** Update edit mode with snapshot handling. */
  const handleSetEditMode = React.useCallback((nextEditMode: boolean) => {
    setEditMode((prev) => {
      if (!prev && nextEditMode) {
        snapshotRef.current = cloneDesktopItems(items);
      }
      if (prev && !nextEditMode) snapshotRef.current = null;
      return nextEditMode;
    });
  }, [items]);

  React.useEffect(() => {
    if (editMode) return;
    // 逻辑：退出编辑态时清理放置状态。
    setPlacementItemId(null);
    setPlacementPointer(null);
  }, [editMode]);

  /** Handle placement mode completion. */
  const handlePlacementEnd = React.useCallback(() => {
    // 逻辑：结束放置模式，清理状态。
    setPlacementItemId(null);
    setPlacementPointer(null);
  }, []);

  /** Update a single desktop item. */
  const handleUpdateItem = React.useCallback(
    (itemId: string, updater: (item: DesktopItem) => DesktopItem) => {
      setItems((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)));
    },
    []
  );

  /** Undo the latest edit. */
  const handleUndo = React.useCallback(() => {
    const history = historyRef.current;
    if (history.past.length <= 1) return;
    const current = history.past[history.past.length - 1];
    const previous = history.past[history.past.length - 2];
    // 逻辑：撤回到上一个快照，并记录到 future。
    history.suspended = true;
    history.past = history.past.slice(0, -1);
    history.future = [current, ...history.future];
    setItems(cloneDesktopItems(previous));
    window.setTimeout(() => {
      historyRef.current.suspended = false;
    }, 0);
  }, []);

  /** Redo the latest reverted edit. */
  const handleRedo = React.useCallback(() => {
    const history = historyRef.current;
    if (history.future.length === 0) return;
    const next = history.future[0];
    // 逻辑：前进到 future 的最新快照。
    history.suspended = true;
    history.future = history.future.slice(1);
    history.past = [...history.past, next];
    setItems(cloneDesktopItems(next));
    window.setTimeout(() => {
      historyRef.current.suspended = false;
    }, 0);
  }, []);

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

  /** Trigger a compact layout pass. */
  const handleCompact = React.useCallback(() => {
    // 逻辑：递增信号用于触发 Gridstack compact。
    setCompactSignal((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    /** Handle widget selection event from the stack panel. */
    const handleWidgetSelected = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as DesktopWidgetSelectedDetail | undefined;
      if (!detail) return;
      if (!activeTabId || detail.tabId !== activeTabId) return;

      // 逻辑：用同步变量承接新建组件 id，供放置模式使用。
      let nextPlacementId: string | null = null;
      let nextPlacementPointer: { clientX: number; clientY: number } | null = null;
      setItems((prev) => {
        const nextItem = createWidgetItem(detail.widgetKey, prev);
        if (!nextItem) return prev;
        nextPlacementId = nextItem.id;
        return [...prev, nextItem];
      });
      if (detail.clientX != null && detail.clientY != null) {
        nextPlacementPointer = { clientX: detail.clientX, clientY: detail.clientY };
      }
      if (nextPlacementId) {
        setPlacementItemId(nextPlacementId);
        setPlacementPointer(nextPlacementPointer);
      }
    };

    window.addEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    return () => {
      window.removeEventListener(DESKTOP_WIDGET_SELECTED_EVENT, handleWidgetSelected as EventListener);
    };
  }, [activeTabId]);

  React.useEffect(() => {
    if (!editMode) {
      historyRef.current = { past: [], future: [], suspended: false };
      return;
    }
    // 逻辑：进入编辑态时重置历史，只保留当前快照。
    historyRef.current = {
      past: [cloneDesktopItems(items)],
      future: [],
      suspended: false,
    };
  }, [editMode, items]);

  React.useEffect(() => {
    if (!editMode) return;
    const history = historyRef.current;
    if (history.suspended) return;
    const nextSnapshot = cloneDesktopItems(items);
    const lastSnapshot = history.past[history.past.length - 1];
    if (lastSnapshot && areDesktopItemsEqual(lastSnapshot, nextSnapshot)) return;
    // 逻辑：每次状态变更写入历史，并清空未来栈。
    history.past = [...history.past, nextSnapshot];
    history.future = [];
  }, [editMode, items]);

  React.useEffect(() => {
    if (!editMode) return;

    /** Handle undo/redo shortcuts in edit mode. */
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }

      const hasModifier = event.metaKey || event.ctrlKey;
      if (!hasModifier) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editMode, handleRedo, handleUndo]);

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
              <Button type="button" size="sm" variant="secondary" onClick={handleCompact}>
                整理
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
          activeBreakpoint={activeBreakpoint}
          onViewBreakpointChange={setActiveBreakpoint}
          onSetEditMode={handleSetEditMode}
          onUpdateItem={handleUpdateItem}
          onChangeItems={setItems}
          compactSignal={compactSignal}
          placementItemId={placementItemId}
          placementPointer={placementPointer}
          onPlacementEnd={handlePlacementEnd}
        />
      </div>
    </div>
  );
}
