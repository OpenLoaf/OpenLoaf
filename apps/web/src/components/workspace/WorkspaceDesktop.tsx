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
import { useMutation } from "@tanstack/react-query";
import { LayoutDashboard } from "lucide-react";
import DesktopEditToolbar from "@/components/desktop/DesktopEditToolbar";
import DesktopPage, { getInitialDesktopItems } from "@/components/desktop/DesktopPage";
import type { DesktopItem } from "@/components/desktop/types";
import { areDesktopItemsEqual, cloneDesktopItems } from "@/components/desktop/desktop-history";
import {
  ensureLayoutByBreakpoint,
  type DesktopBreakpoint,
  type DesktopBreakpointLock,
} from "@/components/desktop/desktop-breakpoints";
import { filterDesktopItemsByScope } from "@/components/desktop/desktop-support";
import {
  deserializeDesktopItems,
  getWorkspaceDesktopFileUri,
  serializeDesktopItems,
} from "@/components/desktop/desktop-persistence";
import { queryClient, trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

interface DesktopHistorySnapshot {
  /** Past snapshots (oldest -> newest). */
  past: DesktopItem[][];
  /** Future snapshots (newest -> oldest). */
  future: DesktopItem[][];
  /** Whether history updates are suspended. */
  suspended: boolean;
}

/** Render workspace-level desktop with persistence at workspace root. */
const WorkspaceDesktop = React.memo(function WorkspaceDesktop({
  tabId: ownTabId,
}: {
  tabId?: string;
}) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const workspaceRootUri = workspace?.rootUri ?? "";
  const globalActiveTabId = useTabs((state) => state.activeTabId);
  const activeTabId = ownTabId || globalActiveTabId;
  const setTabBaseParams = useTabRuntime((state) => state.setTabBaseParams);
  const pushStackItem = useTabRuntime((state) => state.pushStackItem);
  const [items, setItems] = React.useState<DesktopItem[]>(() =>
    ensureLayoutByBreakpoint(getInitialDesktopItems("workspace"))
  );
  const [editMode, setEditMode] = React.useState(false);
  const [viewBreakpoint, setViewBreakpoint] = React.useState<DesktopBreakpoint>("lg");
  // 中文注释：编辑态断点锁定，默认 auto。
  const [editBreakpointLock, setEditBreakpointLock] = React.useState<DesktopBreakpointLock>("auto");
  /** Signal value used for triggering grid compact. */
  const [compactSignal, setCompactSignal] = React.useState(0);
  const editSnapshotRef = React.useRef<DesktopItem[] | null>(null);
  /** History snapshots for undo/redo. */
  const historyRef = React.useRef<DesktopHistorySnapshot>({
    past: [],
    future: [],
    suspended: false,
  });
  const controlsSlotRef = React.useRef<HTMLDivElement | null>(null);
  const [controlsTarget, setControlsTarget] = React.useState<HTMLDivElement | null>(null);
  const loadedUriRef = React.useRef<string | null>(null);
  const saveDesktopMutation = useMutation(trpc.fs.writeFile.mutationOptions());

  // 逻辑：桌面布局持久化文件路径（工作区根目录）。
  const desktopFileUri = React.useMemo(
    () => (workspaceRootUri ? getWorkspaceDesktopFileUri(workspaceRootUri) : null),
    [workspaceRootUri]
  );

  React.useEffect(() => {
    if (!desktopFileUri) return;
    if (!workspaceId) return;
    if (loadedUriRef.current === desktopFileUri) return;
    loadedUriRef.current = desktopFileUri;
    let alive = true;

    const loadDesktop = async () => {
      try {
        // 逻辑：读取 workspace/desktop.openloaf 并初始化桌面布局。
        const result = await queryClient.fetchQuery(
          trpc.fs.readFile.queryOptions({
            workspaceId,
            uri: desktopFileUri,
          })
        );
        const parsed = deserializeDesktopItems(result.content);
        if (!parsed || !alive) return;
        const scopedItems = filterDesktopItemsByScope("workspace", parsed);
        setItems(ensureLayoutByBreakpoint(scopedItems));
      } catch {
        // ignore missing desktop file
      }
    };

    void loadDesktop();

    return () => {
      alive = false;
    };
  }, [desktopFileUri, workspaceId]);

  React.useEffect(() => {
    // 逻辑：同步工作区上下文到自身 tab 的 base 参数，供桌面组件读取。
    // 使用 ownTabId 而非全局 activeTabId，避免切换 tab 时覆盖其他 tab 的 rootUri。
    if (!ownTabId) return;
    if (!workspaceId || !workspaceRootUri) return;
    setTabBaseParams(ownTabId, { workspaceId, rootUri: workspaceRootUri });
  }, [ownTabId, setTabBaseParams, workspaceId, workspaceRootUri]);

  React.useEffect(() => {
    // header slot ref 由上层控制，这里等其挂载后再渲染 portal。
    setControlsTarget(controlsSlotRef.current);
  }, []);

  /** Update edit mode state. */
  const handleSetEditMode = React.useCallback(
    (nextEditMode: boolean) => {
      setEditMode((prev) => {
        if (!prev && nextEditMode) {
          // 进入编辑态时记录快照，用于"取消"回滚。
          editSnapshotRef.current = cloneDesktopItems(items);
        }
        if (prev && !nextEditMode) {
          editSnapshotRef.current = null;
        }
        return nextEditMode;
      });
    },
    [items]
  );

  React.useEffect(() => {
    if (editMode) return;
    if (editBreakpointLock === "auto") return;
    // 中文注释：退出编辑态时重置断点锁定。
    setEditBreakpointLock("auto");
  }, [editMode, editBreakpointLock]);

  /** Append a new desktop item. */
  const handleAddItem = React.useCallback((item: DesktopItem) => {
    setItems((prev) => ensureLayoutByBreakpoint([...prev, item]));
  }, []);

  /** Update a single desktop item. */
  const handleUpdateItem = React.useCallback(
    (itemId: string, updater: (item: DesktopItem) => DesktopItem) => {
      setItems((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)));
    },
    []
  );

  /** Update a single desktop item and persist it to desktop.openloaf. */
  const handleUpdateItemPersist = React.useCallback(
    (itemId: string, updater: (item: DesktopItem) => DesktopItem) => {
      let nextItems: DesktopItem[] | null = null;
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === itemId ? updater(item) : item));
        nextItems = updated;
        return updated;
      });
      if (!desktopFileUri || !workspaceId || !nextItems) return;
      // 中文注释：编辑对话框保存时立即持久化桌面布局。
      const payload = serializeDesktopItems(nextItems);
      void saveDesktopMutation.mutateAsync({
        workspaceId,
        uri: desktopFileUri,
        content: JSON.stringify(payload, null, 2),
      });
    },
    [desktopFileUri, saveDesktopMutation, workspaceId]
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

  /** Cancel edits and restore snapshot. */
  const handleCancel = React.useCallback(() => {
    const snapshot = editSnapshotRef.current;
    if (snapshot) setItems(snapshot);
    editSnapshotRef.current = null;
    setEditMode(false);
  }, []);

  /** Finish edits and clear snapshot. */
  const handleDone = React.useCallback(async () => {
    editSnapshotRef.current = null;
    setEditMode(false);
    if (!desktopFileUri) return;
    if (!workspaceId) return;
    // 逻辑：保存当前桌面布局到 desktop.openloaf。
    const payload = serializeDesktopItems(items);
    await saveDesktopMutation.mutateAsync({
      workspaceId,
      uri: desktopFileUri,
      content: JSON.stringify(payload, null, 2),
    });
  }, [desktopFileUri, items, saveDesktopMutation, workspaceId]);

  /** Trigger a compact layout pass. */
  const handleCompact = React.useCallback(() => {
    // 逻辑：递增信号用于触发 Gridstack compact。
    setCompactSignal((prev) => prev + 1);
  }, []);

  /** Open the desktop widget library stack panel. */
  const handleOpenWidgetLibrary = React.useCallback(() => {
    if (!activeTabId) return;
    pushStackItem(activeTabId, {
      id: "desktop-widget-library",
      sourceKey: "desktop-widget-library",
      component: "desktop-widget-library",
      title: "组件库",
    });
  }, [activeTabId, pushStackItem]);

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

  const effectiveEditBreakpoint =
    editBreakpointLock === "auto" ? viewBreakpoint : editBreakpointLock;

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 bg-background/80 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LayoutDashboard className="h-4 w-4 text-amber-700/70 dark:text-amber-300/70" />
          <span>工作台</span>
        </div>
        <div ref={controlsSlotRef} className="workspace-desktop-header-controls" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <DesktopEditToolbar
          controlsTarget={controlsTarget}
          editMode={editMode}
          activeBreakpoint={effectiveEditBreakpoint}
          items={items}
          onAddItem={handleAddItem}
          onCompact={handleCompact}
          onCancel={handleCancel}
          onDone={handleDone}
          onEnterEditMode={() => handleSetEditMode(true)}
        />
        <div className="min-h-0 flex-1">
          <DesktopPage
            items={items}
            scope="workspace"
            editMode={editMode}
            activeBreakpoint={viewBreakpoint}
            editBreakpointLock={editBreakpointLock}
            bottomPadding={56}
            onViewBreakpointChange={setViewBreakpoint}
            onSetEditMode={handleSetEditMode}
            onUpdateItem={handleUpdateItem}
            onPersistItemUpdate={handleUpdateItemPersist}
            onChangeItems={setItems}
            compactSignal={compactSignal}
            onOpenWidgetLibrary={handleOpenWidgetLibrary}
            onCompact={handleCompact}
            onCancel={handleCancel}
            onDone={handleDone}
          />
        </div>
      </div>
    </div>
  );
});

export default WorkspaceDesktop;
