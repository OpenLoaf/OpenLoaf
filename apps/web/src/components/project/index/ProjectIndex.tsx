"use client";

import * as React from "react";
import ProjectTitle from "../ProjectTitle";
import DesktopPage, { initialItems } from "@/components/desktop/DesktopPage";
import DesktopEditToolbar from "@/components/desktop/DesktopEditToolbar";
import type { DesktopItem } from "@/components/desktop/types";

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
          editSnapshotRef.current = items.map((item) => ({
            ...item,
            layout: { ...item.layout },
          }));
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
