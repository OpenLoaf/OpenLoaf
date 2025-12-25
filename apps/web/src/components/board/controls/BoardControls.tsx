"use client";

import { memo, useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Lock, Maximize2, Redo2, Undo2, Unlock, ZoomIn, ZoomOut } from "lucide-react";

import { IconBtn } from "../../project/convas/toolbar/ToolbarParts";
import type { CanvasEngine } from "../CanvasEngine";
import type { CanvasSnapshot } from "../CanvasTypes";

export interface BoardControlsProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for viewport state. */
  snapshot: CanvasSnapshot;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.1;
const iconSize = 16;

/** Render the left-side toolbar for the board canvas. */
const BoardControls = memo(function BoardControls({ engine, snapshot }: BoardControlsProps) {
  const { zoom, size } = snapshot.viewport;
  const minZoomReached = zoom <= MIN_ZOOM;
  const maxZoomReached = zoom >= MAX_ZOOM;

  const handleZoomIn = useCallback(() => {
    // 逻辑：以视口中心为锚点放大，保持缩放体验稳定。
    engine.viewport.setZoom(zoom * ZOOM_STEP, [size[0] / 2, size[1] / 2]);
  }, [engine, size, zoom]);

  const handleZoomOut = useCallback(() => {
    engine.viewport.setZoom(zoom / ZOOM_STEP, [size[0] / 2, size[1] / 2]);
  }, [engine, size, zoom]);

  const handleFitView = useCallback(() => {
    engine.fitToElements();
  }, [engine]);

  const handleUndo = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    engine.undo();
  }, [engine]);

  const handleRedo = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    engine.redo();
  }, [engine]);

  const toggleLock = useCallback(() => {
    engine.setLocked(!snapshot.locked);
  }, [engine, snapshot.locked]);

  return (
    <div
      data-board-controls
      style={{
        position: "absolute",
        top: "50%",
        left: "1rem",
        transform: "translateY(-50%)",
        margin: 0,
        zIndex: 20,
      }}
      onPointerDown={event => {
        // 逻辑：避免控制条点击触发画布选择。
        event.stopPropagation();
      }}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-2xl bg-background/70 px-1.5 py-1 ring-1 ring-border backdrop-blur-md">
        <IconBtn
          title="撤销"
          onPointerDown={handleUndo}
          disabled={!snapshot.canUndo}
          className="h-8 w-8"
        >
          <Undo2 size={iconSize} />
        </IconBtn>
        <IconBtn
          title="前进"
          onPointerDown={handleRedo}
          disabled={!snapshot.canRedo}
          className="h-8 w-8"
        >
          <Redo2 size={iconSize} />
        </IconBtn>
        <IconBtn
          title="放大"
          onClick={handleZoomIn}
          disabled={maxZoomReached}
          className="h-8 w-8"
        >
          <ZoomIn size={iconSize} />
        </IconBtn>
        <IconBtn
          title="缩小"
          onClick={handleZoomOut}
          disabled={minZoomReached}
          className="h-8 w-8"
        >
          <ZoomOut size={iconSize} />
        </IconBtn>
        <IconBtn title="全屏" onClick={handleFitView} className="h-8 w-8">
          <Maximize2 size={iconSize} />
        </IconBtn>
        <IconBtn
          title={snapshot.locked ? "解锁" : "锁定"}
          onClick={toggleLock}
          active={snapshot.locked}
          className="h-8 w-8"
        >
          {snapshot.locked ? <Lock size={iconSize} /> : <Unlock size={iconSize} />}
        </IconBtn>
      </div>
    </div>
  );
});

export default BoardControls;
