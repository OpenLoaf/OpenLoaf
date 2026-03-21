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

import { memo, useCallback, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@udecode/cn";
import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  Lock,
  Redo2,
  Scan,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { IconBtn, toolbarSurfaceClassName } from "../ui/ToolbarParts";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasSnapshot } from "../engine/types";
import { useBoardViewState } from "../core/useBoardViewState";

export interface BoardControlsProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for viewport state. */
  snapshot: CanvasSnapshot;
  /** Auto layout callback. */
  onAutoLayout?: () => void;
}

const ZOOM_STEP = 1.1;
const iconSize = 16;
const ZOOM_HOLD_DELAY = 260;
const ZOOM_HOLD_INTERVAL = 80;
/** 控制条图标 hover 放大样式。 */
const controlIconClassName =
  "origin-center transition-transform duration-150 ease-out group-hover:scale-[1.2]";

/* ── 图标颜色（TE 工业风：统一单色，仅 active 才着色） ── */
/** 操作类（撤销/重做）。 */
const iconColorAction = "text-ol-text-secondary";
/** 视图类（缩放）。 */
const iconColorView = "text-ol-text-secondary";
/** 布局类（自动布局/最大化）。 */
const iconColorLayout = "text-ol-text-secondary";
/** 安全类（锁定）— 红色保留警示。 */
const iconColorSafety = "text-ol-red";
/** Build a tooltip title with optional shortcut. */
const buildControlTitle = (label: string, shortcut?: string) =>
  shortcut ? `${label} (${shortcut})` : label;

/** Render the left-side toolbar for the board canvas. */
const BoardControls = memo(function BoardControls({
  engine,
  snapshot,
  onAutoLayout,
}: BoardControlsProps) {
  const { t } = useTranslation('board');
  // 逻辑：视图状态独立订阅，避免缩放时触发全局快照刷新。
  const viewState = useBoardViewState(engine);
  const { zoom, size } = viewState.viewport;
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

  /** Trigger auto layout for the board. */
  const handleAutoLayout = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    engine.autoLayoutBoard();
    // 逻辑：自动布局后通知上层调度缩略图截取。
    onAutoLayout?.();
  }, [engine, onAutoLayout]);

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

  /** Resolve modifier display based on platform. */
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform),
    []
  );
  const undoShortcut = isMac ? "⌘Z" : "Ctrl+Z";
  const redoShortcut = isMac ? "⌘⇧Z" : "Ctrl+Shift+Z / Ctrl+Y";
  const undoTitle = buildControlTitle(t('controls.undo'), undoShortcut);
  const redoTitle = buildControlTitle(t('controls.redo'), redoShortcut);
  const fitTitle = buildControlTitle(t('controls.maximize'), 'F');
  const autoLayoutShortcut = isMac ? "⌘⇧L" : "Ctrl+Shift+L";
  const autoLayoutTitle = buildControlTitle(t('controls.autoLayout'), autoLayoutShortcut);
  const lockTitle = buildControlTitle(snapshot.locked ? t('controls.unlock') : t('controls.lock'), 'L');

  return (
    <div
      data-board-controls
      className="absolute left-4 top-1/2 z-20 -translate-y-1/2"
      onPointerDown={event => {
        // 逻辑：避免控制条点击触发画布选择。
        event.stopPropagation();
      }}
    >
      <div
        className={cn(
          "pointer-events-auto flex flex-col items-center gap-1 rounded-3xl px-1.5 py-1",
          toolbarSurfaceClassName
        )}
      >
        <IconBtn
          title={undoTitle}
          onPointerDown={handleUndo}
          disabled={snapshot.locked || !snapshot.canUndo}
          tooltipSide="right"
          className="group"
        >
          <Undo2 size={iconSize} className={cn(controlIconClassName, iconColorAction)} />
        </IconBtn>
        <IconBtn
          title={redoTitle}
          onPointerDown={handleRedo}
          disabled={snapshot.locked || !snapshot.canRedo}
          tooltipSide="right"
          className="group"
        >
          <Redo2 size={iconSize} className={cn(controlIconClassName, iconColorAction)} />
        </IconBtn>
        <IconBtn
          title={t('controls.zoomIn')}
          onPointerDown={startZoomHold("in")}
          disabled={maxZoomReached}
          tooltipSide="right"
          className="group"
        >
          <ZoomIn size={iconSize} className={cn(controlIconClassName, iconColorView)} />
        </IconBtn>
        <IconBtn
          title={t('controls.zoomOut')}
          onPointerDown={startZoomHold("out")}
          disabled={minZoomReached}
          tooltipSide="right"
          className="group"
        >
          <ZoomOut size={iconSize} className={cn(controlIconClassName, iconColorView)} />
        </IconBtn>
        <IconBtn
          title={autoLayoutTitle}
          onPointerDown={handleAutoLayout}
          disabled={snapshot.locked}
          tooltipSide="right"
          className="group"
        >
          <LayoutGrid size={iconSize} className={cn(controlIconClassName, iconColorLayout)} />
        </IconBtn>
        <IconBtn title={fitTitle} onPointerDown={handleFitView} tooltipSide="right" className="group">
          <Scan size={iconSize} className={cn(controlIconClassName, iconColorLayout)} />
        </IconBtn>
        <IconBtn
          title={lockTitle}
          onPointerDown={toggleLock}
          active={snapshot.locked}
          tooltipSide="right"
          className="group"
        >
          {snapshot.locked ? (
            <Unlock size={iconSize} className={cn(controlIconClassName, iconColorSafety)} />
          ) : (
            <Lock size={iconSize} className={cn(controlIconClassName, iconColorSafety)} />
          )}
        </IconBtn>
      </div>
    </div>
  );
});

export default BoardControls;
