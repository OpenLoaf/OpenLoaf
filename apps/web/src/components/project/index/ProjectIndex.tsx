"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import ProjectTitle from "../ProjectTitle";
import DesktopPage, { initialItems } from "@/components/desktop/DesktopPage";
import { Button } from "@/components/ui/button";
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

  if (!isActive) return null;

  return (
    <>
      {controlsTarget && editMode
        ? createPortal(
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const snapshot = editSnapshotRef.current;
                  if (snapshot) setItems(snapshot);
                  editSnapshotRef.current = null;
                  setEditMode(false);
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  editSnapshotRef.current = null;
                  setEditMode(false);
                }}
              >
                完成
              </Button>
            </div>,
            controlsTarget
          )
        : null}

      <DesktopPage
        items={items}
        editMode={editMode}
        onSetEditMode={handleSetEditMode}
        onChangeItems={setItems}
      />
    </>
  );
});

export { ProjectIndexHeader };
export default ProjectIndex;
