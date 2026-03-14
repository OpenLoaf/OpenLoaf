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
import DesktopPage, { getInitialDesktopItems } from "@/components/desktop/DesktopPage";
import DesktopEditToolbar from "@/components/desktop/DesktopEditToolbar";
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
  getDesktopFileUri,
  serializeDesktopItems,
} from "@/components/desktop/desktop-persistence";
import { queryClient, trpc } from "@/utils/trpc";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useHeaderSlot } from "@/hooks/use-header-slot";

interface ProjectIndexProps {
  /** Whether the page data is loading. */
  isLoading: boolean;
  /** Whether the tab is currently active. */
  isActive: boolean;
  /** Current project id. */
  projectId?: string;
  /** Current project root uri. */
  rootUri?: string;
  /** Current project title. */
  projectTitle: string;
  /** Whether the homepage is read-only. */
  readOnly: boolean;
  /** Notify parent about dirty state. */
  onDirtyChange: (dirty: boolean) => void;
  /** Notify parent when publish succeeds. */
  onPublishSuccess: () => void;
  /** Notify parent when edit mode changes. */
  onEditModeChange?: (nextEditMode: boolean) => void;
}

interface DesktopHistorySnapshot {
  /** Past snapshots (oldest -> newest). */
  past: DesktopItem[][];
  /** Future snapshots (newest -> oldest). */
  future: DesktopItem[][];
  /** Whether history updates are suspended. */
  suspended: boolean;
}

/** Render the new iOS-like desktop MVP (UI only). */
const ProjectIndex = React.memo(function ProjectIndex({
  isActive,
  onDirtyChange,
  onEditModeChange,
  projectId,
  rootUri,
}: ProjectIndexProps) {
  const pushStackItem = useLayoutState((state) => state.pushStackItem);
  const [items, setItems] = React.useState<DesktopItem[]>(() =>
    ensureLayoutByBreakpoint(getInitialDesktopItems("project"))
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
  const headerActionsTarget = useHeaderSlot((s) => s.headerActionsTarget);
  // 逻辑：桌面布局持久化文件路径。
  const desktopFileUri = React.useMemo(
    () => (rootUri ? getDesktopFileUri(rootUri) : null),
    [rootUri]
  );
  const loadedUriRef = React.useRef<string | null>(null);
  const saveDesktopMutation = useMutation(trpc.fs.writeFile.mutationOptions());

  React.useEffect(() => {
    console.log("[Desktop] useEffect:", { desktopFileUri, loadedUri: loadedUriRef.current, projectId });
    if (!desktopFileUri) return;
    if (loadedUriRef.current === desktopFileUri) return;
    loadedUriRef.current = desktopFileUri;
    let alive = true;

    const loadDesktop = async () => {
      try {
        // 逻辑：读取 desktop.openloaf 并初始化桌面布局。
        // staleTime: 0 强制从磁盘读取，避免缓存返回保存前的旧数据。
        const result = await queryClient.fetchQuery({
          ...trpc.fs.readFile.queryOptions({
            projectId,
            uri: desktopFileUri,
          }),
          staleTime: 0,
        });
        console.log("[Desktop] loadDesktop result:", { uri: desktopFileUri, contentLength: result.content.length, alive });
        const parsed = deserializeDesktopItems(result.content);
        console.log("[Desktop] parsed items:", parsed?.length, parsed?.map(i => ({ id: i.id, lg: i.layoutByBreakpoint?.lg })));
        if (!parsed || !alive) return;
        const scopedItems = filterDesktopItemsByScope("project", parsed);
        console.log("[Desktop] scopedItems:", scopedItems.length);
        setItems(ensureLayoutByBreakpoint(scopedItems));
      } catch (err) {
        console.error("[Desktop] loadDesktop error:", err);
        // ignore missing desktop file
      }
    };

    void loadDesktop();
    return () => {
      alive = false;
    };
  }, [desktopFileUri, projectId]);

  React.useEffect(() => {
    // 桌面 MVP 暂时不产生“脏状态”，先专注交互与动画。
    onDirtyChange(false);
  }, [onDirtyChange]);

  React.useLayoutEffect(() => {
    // 逻辑：同步桌面编辑态到头部控制区，避免首帧闪动。
    onEditModeChange?.(editMode);
  }, [editMode, onEditModeChange]);

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
      if (!desktopFileUri || !nextItems) return;
      // 中文注释：编辑对话框保存时立即持久化桌面布局。
      const payload = serializeDesktopItems(nextItems);
      void saveDesktopMutation.mutateAsync({
        projectId,
        uri: desktopFileUri,
        content: JSON.stringify(payload, null, 2),
      }).then(() => {
        void queryClient.invalidateQueries({
          queryKey: trpc.fs.readFile.queryOptions({ projectId, uri: desktopFileUri }).queryKey,
        });
      });
    },
    [desktopFileUri, projectId, saveDesktopMutation]
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
    // 逻辑：保存当前桌面布局到 desktop.openloaf。
    const payload = serializeDesktopItems(items);
    await saveDesktopMutation.mutateAsync({
      projectId,
      uri: desktopFileUri,
      content: JSON.stringify(payload, null, 2),
    });
    // 逻辑：使 readFile 缓存失效，确保下次加载时读取最新文件内容。
    void queryClient.invalidateQueries({
      queryKey: trpc.fs.readFile.queryOptions({ projectId, uri: desktopFileUri }).queryKey,
    });
  }, [desktopFileUri, items, projectId, saveDesktopMutation]);

  /** Trigger a compact layout pass. */
  const handleCompact = React.useCallback(() => {
    // 逻辑：递增信号用于触发 Gridstack compact。
    setCompactSignal((prev) => prev + 1);
  }, []);

  /** Open the desktop widget library stack panel. */
  const handleOpenWidgetLibrary = React.useCallback(() => {
    pushStackItem({
      id: "desktop-widget-library",
      sourceKey: "desktop-widget-library",
      component: "desktop-widget-library",
      title: "组件库",
    });
  }, [pushStackItem]);

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

  const effectiveTarget = isActive ? headerActionsTarget : null;

  if (!isActive) return null;

  return (
    <>
      <DesktopEditToolbar
        controlsTarget={effectiveTarget}
        editMode={editMode}
        activeBreakpoint={effectiveEditBreakpoint}
        items={items}
        onAddItem={handleAddItem}
        onCompact={handleCompact}
        onCancel={handleCancel}
        onDone={handleDone}
        onEnterEditMode={() => handleSetEditMode(true)}
      />

      <DesktopPage
        items={items}
        scope="project"
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
    </>
  );
});

export default ProjectIndex;
