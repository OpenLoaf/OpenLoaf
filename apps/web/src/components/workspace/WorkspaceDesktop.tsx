"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import DesktopEditToolbar from "@/components/desktop/DesktopEditToolbar";
import DesktopPage, { getInitialDesktopItems } from "@/components/desktop/DesktopPage";
import type { DesktopItem } from "@/components/desktop/types";
import { areDesktopItemsEqual, cloneDesktopItems } from "@/components/desktop/desktop-history";
import {
  ensureLayoutByBreakpoint,
  type DesktopBreakpoint,
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
const WorkspaceDesktop = React.memo(function WorkspaceDesktop() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const workspaceRootUri = workspace?.rootUri ?? "";
  const activeTabId = useTabs((state) => state.activeTabId);
  const setTabBaseParams = useTabRuntime((state) => state.setTabBaseParams);
  const [items, setItems] = React.useState<DesktopItem[]>(() =>
    ensureLayoutByBreakpoint(getInitialDesktopItems("workspace"))
  );
  const [editMode, setEditMode] = React.useState(false);
  const [viewBreakpoint, setViewBreakpoint] = React.useState<DesktopBreakpoint>("lg");
  const [editBreakpoint, setEditBreakpoint] = React.useState<DesktopBreakpoint>("lg");
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
        // 逻辑：读取 workspace/desktop.tenas 并初始化桌面布局。
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
    // 逻辑：同步工作区上下文到 tab base 参数，供桌面组件读取。
    if (!activeTabId) return;
    if (!workspaceId || !workspaceRootUri) return;
    setTabBaseParams(activeTabId, { workspaceId, rootUri: workspaceRootUri });
  }, [activeTabId, setTabBaseParams, workspaceId, workspaceRootUri]);

  React.useEffect(() => {
    // header slot ref 由上层控制，这里等其挂载后再渲染 portal。
    setControlsTarget(controlsSlotRef.current);
  }, []);

  /** Update edit mode state. */
  const handleSetEditMode = React.useCallback(
    (nextEditMode: boolean) => {
      setEditMode((prev) => {
        if (!prev && nextEditMode) {
          // 进入编辑态时记录快照，用于“取消”回滚。
          editSnapshotRef.current = cloneDesktopItems(items);
          setEditBreakpoint(viewBreakpoint);
        }
        if (prev && !nextEditMode) {
          editSnapshotRef.current = null;
        }
        return nextEditMode;
      });
    },
    [items, viewBreakpoint]
  );

  /** Append a new desktop item. */
  const handleAddItem = React.useCallback((item: DesktopItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  /** Update a single desktop item. */
  const handleUpdateItem = React.useCallback(
    (itemId: string, updater: (item: DesktopItem) => DesktopItem) => {
      setItems((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)));
    },
    []
  );

  /** Update a single desktop item and persist it to desktop.tenas. */
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
    // 逻辑：保存当前桌面布局到 desktop.tenas。
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
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Image src="/head_s.png" alt="" width={16} height={16} className="h-4 w-4" />
          <span>工作台</span>
        </div>
        <div ref={controlsSlotRef} className="flex items-center gap-2" />
      </div>
      <div className="min-h-0 flex-1">
        <DesktopEditToolbar
          controlsTarget={controlsTarget}
          editMode={editMode}
          activeBreakpoint={editBreakpoint}
          items={items}
          onChangeBreakpoint={setEditBreakpoint}
          onAddItem={handleAddItem}
          onCompact={handleCompact}
          onCancel={handleCancel}
          onDone={handleDone}
        />
        <DesktopPage
          items={items}
          scope="workspace"
          editMode={editMode}
          activeBreakpoint={editBreakpoint}
          onViewBreakpointChange={setViewBreakpoint}
          onSetEditMode={handleSetEditMode}
          onUpdateItem={handleUpdateItem}
          onPersistItemUpdate={handleUpdateItemPersist}
          onChangeItems={setItems}
          compactSignal={compactSignal}
        />
      </div>
    </div>
  );
});

export default WorkspaceDesktop;
