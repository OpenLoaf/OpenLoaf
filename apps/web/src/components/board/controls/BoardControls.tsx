"use client";

import { memo, useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Lock, Maximize2, Redo2, Undo2, Unlock, ZoomIn, ZoomOut } from "lucide-react";

import { IconBtn } from "../ui/ToolbarParts";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasSnapshot } from "../engine/types";

export interface BoardControlsProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for viewport state. */
  snapshot: CanvasSnapshot;
}

const ZOOM_STEP = 1.1;
const iconSize = 16;
const ZOOM_HOLD_DELAY = 260;
const ZOOM_HOLD_INTERVAL = 80;
/** 控制条图标 hover 放大样式。 */
const controlIconClassName =
  "origin-center transition-transform duration-150 ease-out group-hover:scale-[1.2]";

/** Render the left-side toolbar for the board canvas. */
const BoardControls = memo(function BoardControls({ engine, snapshot }: BoardControlsProps) {
  const { zoom, size } = snapshot.viewport;
  const zoomLimits = engine.viewport.getZoomLimits();
  const minZoomReached = zoom <= zoomLimits.min;
  const maxZoomReached = zoom >= zoomLimits.max;
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

  /** Stop the current zoom-hold behavior. */
  const stopZoomHold = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  /** Start continuous zooming on long press. */
  const startZoomHold = useCallback((direction: "in" | "out") => {
    return (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      stopZoomHold();
      const zoomOnce = () => {
        const anchor: [number, number] = [size[0] / 2, size[1] / 2];
        if (direction === "in") {
          engine.viewport.setZoom(engine.viewport.getState().zoom * ZOOM_STEP, anchor);
        } else {
          engine.viewport.setZoom(engine.viewport.getState().zoom / ZOOM_STEP, anchor);
        }
      };
      zoomOnce();
      // 逻辑：长按触发连续缩放，松开时停止。
      holdTimerRef.current = window.setTimeout(() => {
        holdIntervalRef.current = window.setInterval(zoomOnce, ZOOM_HOLD_INTERVAL);
      }, ZOOM_HOLD_DELAY);

      const handlePointerUp = () => {
        stopZoomHold();
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        window.removeEventListener("blur", handlePointerUp);
      };
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
      window.addEventListener("blur", handlePointerUp);
    };
  }, [engine, size, stopZoomHold]);

  const handleFitView = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
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

  const toggleLock = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    engine.setLocked(!snapshot.locked);
  }, [engine, snapshot.locked]);

  return (
    <div
      data-board-controls
      className="absolute left-4 top-1/2 z-20 -translate-y-1/2"
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
          className="group h-8 w-8"
        >
          <Undo2 size={iconSize} className={controlIconClassName} />
        </IconBtn>
        <IconBtn
          title="前进"
          onPointerDown={handleRedo}
          disabled={!snapshot.canRedo}
          className="group h-8 w-8"
        >
          <Redo2 size={iconSize} className={controlIconClassName} />
        </IconBtn>
        <IconBtn
          title="放大"
          onPointerDown={startZoomHold("in")}
          disabled={maxZoomReached}
          className="group h-8 w-8"
        >
          <ZoomIn size={iconSize} className={controlIconClassName} />
        </IconBtn>
        <IconBtn
          title="缩小"
          onPointerDown={startZoomHold("out")}
          disabled={minZoomReached}
          className="group h-8 w-8"
        >
          <ZoomOut size={iconSize} className={controlIconClassName} />
        </IconBtn>
        <IconBtn title="全屏" onPointerDown={handleFitView} className="group h-8 w-8">
          <Maximize2 size={iconSize} className={controlIconClassName} />
        </IconBtn>
        <IconBtn
          title={snapshot.locked ? "解锁" : "锁定"}
          onPointerDown={toggleLock}
          active={snapshot.locked}
          className="group h-8 w-8"
        >
          {snapshot.locked ? (
            <Unlock size={iconSize} className={controlIconClassName} />
          ) : (
            <Lock size={iconSize} className={controlIconClassName} />
          )}
        </IconBtn>
      </div>
    </div>
  );
});

export default BoardControls;
