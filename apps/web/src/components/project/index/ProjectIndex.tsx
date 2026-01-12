"use client";

import * as React from "react";
import ProjectTitle from "../ProjectTitle";
import DesktopPage, { initialItems } from "@/components/desktop/DesktopPage";
import DesktopEditToolbar from "@/components/desktop/DesktopEditToolbar";
import type { DesktopItem } from "@/components/desktop/types";
import { areDesktopItemsEqual, cloneDesktopItems } from "@/components/desktop/desktop-history";

interface ProjectIndexHeaderProps {
  /** Whether the project data is loading. */
  isLoading: boolean;
  /** Current project id. */
  projectId?: string;
  /** Current project title. */
  projectTitle: string;
  /** Current icon for project title. */
  titleIcon?: string;
  /** Current title value from cache. */
  currentTitle?: string;
  /** Whether the title is being updated. */
  isUpdating: boolean;
  /** Update title callback. */
  onUpdateTitle: (nextTitle: string) => void;
  /** Update icon callback. */
  onUpdateIcon: (nextIcon: string) => void;
  /** Whether the homepage is read-only. */
  isReadOnly: boolean;
  /** Toggle read-only mode. */
  onSetReadOnly: (nextReadOnly: boolean) => void;
  /** Controls slot for header actions. */
  controlsSlotRef: React.RefObject<HTMLDivElement | null>;
  /** Whether to show editing controls. */
  showControls: boolean;
}

interface ProjectIndexProps {
  /** Whether the page data is loading. */
  isLoading: boolean;
  /** Whether the tab is currently active. */
  isActive: boolean;
  /** Current project id. */
  projectId?: string;
  /** Current project title. */
  projectTitle: string;
  /** Whether the homepage is read-only. */
  readOnly: boolean;
  /** Notify parent about dirty state. */
  onDirtyChange: (dirty: boolean) => void;
  /** Notify parent when publish succeeds. */
  onPublishSuccess: () => void;
  /** Controls slot for header actions. */
  controlsSlotRef: React.RefObject<HTMLDivElement | null>;
}

interface DesktopHistorySnapshot {
  /** Past snapshots (oldest -> newest). */
  past: DesktopItem[][];
  /** Future snapshots (newest -> oldest). */
  future: DesktopItem[][];
  /** Whether history updates are suspended. */
  suspended: boolean;
}

/** Render the project index header for the new desktop MVP. */
const ProjectIndexHeader = React.memo(function ProjectIndexHeader({
  isLoading,
  projectId,
  projectTitle,
  titleIcon,
  currentTitle,
  isUpdating,
  onUpdateTitle,
  onUpdateIcon,
  controlsSlotRef,
}: ProjectIndexHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 w-full min-w-0">
      <ProjectTitle
        isLoading={isLoading}
        projectId={projectId}
        projectTitle={projectTitle}
        titleIcon={titleIcon}
        currentTitle={currentTitle}
        isUpdating={isUpdating}
        onUpdateTitle={onUpdateTitle}
        onUpdateIcon={onUpdateIcon}
      />

      <div className="flex items-center gap-2 shrink-0">
        <div ref={controlsSlotRef} className="flex items-center gap-2" />
      </div>
    </div>
  );
});

/** Render the new iOS-like desktop MVP (UI only). */
const ProjectIndex = React.memo(function ProjectIndex({
  isActive,
  onDirtyChange,
  controlsSlotRef,
}: ProjectIndexProps) {
  const [items, setItems] = React.useState<DesktopItem[]>(() => initialItems);
  const [editMode, setEditMode] = React.useState(false);
  /** Signal value used for triggering grid compact. */
  const [compactSignal, setCompactSignal] = React.useState(0);
  const editSnapshotRef = React.useRef<DesktopItem[] | null>(null);
  /** History snapshots for undo/redo. */
  const historyRef = React.useRef<DesktopHistorySnapshot>({
    past: [],
    future: [],
    suspended: false,
  });
  const [controlsTarget, setControlsTarget] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // 桌面 MVP 暂时不产生“脏状态”，先专注交互与动画。
    onDirtyChange(false);
  }, [onDirtyChange]);

  React.useEffect(() => {
    // header slot ref 由上层控制，这里等其挂载后再渲染 portal。
    setControlsTarget(controlsSlotRef.current);
  }, [controlsSlotRef]);

  const handleSetEditMode = React.useCallback(
    (nextEditMode: boolean) => {
      setEditMode((prev) => {
        if (!prev && nextEditMode) {
          // 进入编辑态时记录快照，用于“取消”回滚。
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
  const handleDone = React.useCallback(() => {
    editSnapshotRef.current = null;
    setEditMode(false);
  }, []);

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

  if (!isActive) return null;

  return (
    <>
      <DesktopEditToolbar
        controlsTarget={controlsTarget}
        editMode={editMode}
        items={items}
        onAddItem={handleAddItem}
        onCompact={handleCompact}
        onCancel={handleCancel}
        onDone={handleDone}
      />

      <DesktopPage
        items={items}
        editMode={editMode}
        onSetEditMode={handleSetEditMode}
        onUpdateItem={handleUpdateItem}
        onChangeItems={setItems}
        compactSignal={compactSignal}
      />
    </>
  );
});

export { ProjectIndexHeader };
export default ProjectIndex;
