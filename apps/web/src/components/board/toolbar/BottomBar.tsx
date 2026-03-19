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

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";
import {
  ImagePlus,
  VideoIcon,
  Music2,
  Minus,
  Plus,
  Scan,
  Undo2,
  Redo2,
} from "lucide-react";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasSnapshot } from "../engine/types";
import { IconBtn, toolbarSurfaceClassName } from "../ui/ToolbarParts";
import { useBoardViewState } from "../core/useBoardViewState";
import { DEFAULT_NODE_SIZE } from "../engine/constants";

export interface BottomBarProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for tool state. */
  snapshot: CanvasSnapshot;
}

const ZOOM_STEP = 1.15;
const ZOOM_HOLD_DELAY = 260;
const ZOOM_HOLD_INTERVAL = 80;

/** Bottom bar with AI creation buttons + viewport controls. */
const BottomBar = memo(function BottomBar({
  engine,
  snapshot,
}: BottomBarProps) {
  const { t } = useTranslation("board");
  const viewState = useBoardViewState(engine);
  const { zoom, size } = viewState.viewport;
  const zoomLimits = engine.viewport.getZoomLimits();
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const isLocked = snapshot.locked;

  const zoomPercent = `${Math.round(zoom * 100)}%`;

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

  // 逻辑：组件卸载时清理缩放长按定时器，防止泄漏。
  useEffect(() => () => { stopZoomHold(); }, [stopZoomHold]);

  const startZoomHold = useCallback(
    (direction: "in" | "out") => {
      return (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        stopZoomHold();
        const zoomOnce = () => {
          const anchor: [number, number] = [size[0] / 2, size[1] / 2];
          const current = engine.viewport.getState().zoom;
          engine.viewport.setZoom(
            direction === "in" ? current * ZOOM_STEP : current / ZOOM_STEP,
            anchor,
          );
        };
        zoomOnce();
        holdTimerRef.current = window.setTimeout(() => {
          holdIntervalRef.current = window.setInterval(
            zoomOnce,
            ZOOM_HOLD_INTERVAL,
          );
        }, ZOOM_HOLD_DELAY);

        const handleUp = () => {
          stopZoomHold();
          window.removeEventListener("pointerup", handleUp);
          window.removeEventListener("pointercancel", handleUp);
        };
        window.addEventListener("pointerup", handleUp);
        window.addEventListener("pointercancel", handleUp);
      };
    },
    [engine, size, stopZoomHold],
  );

  const handleFitView = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      engine.fitToElements();
    },
    [engine],
  );

  const handleUndo = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      engine.undo();
    },
    [engine],
  );

  const handleRedo = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      engine.redo();
    },
    [engine],
  );

  /** Create a new empty AI generation node and select it. */
  const createAiNode = useCallback(
    (nodeType: "image" | "video" | "audio") => {
      if (isLocked) return;
      const viewport = engine.viewport.getState();
      const centerWorld = engine.screenToWorld([
        viewport.size[0] / 2,
        viewport.size[1] / 2,
      ]);
      const [w, h] = DEFAULT_NODE_SIZE;
      const xywh: [number, number, number, number] = [
        centerWorld[0] - w / 2,
        centerWorld[1] - h / 2,
        w,
        h,
      ];

      let props: Record<string, unknown> = {};
      if (nodeType === "image") {
        props = {
          previewSrc: "",
          originalSrc: "",
          mimeType: "image/png",
          fileName: "ai-generated.png",
          naturalWidth: w,
          naturalHeight: h,
          origin: "ai-generate",
        };
      } else if (nodeType === "video") {
        props = {
          sourcePath: "",
          fileName: "ai-generated.mp4",
          origin: "ai-generate",
        };
      } else {
        props = {
          sourcePath: "",
          fileName: "ai-generated.mp3",
          origin: "ai-generate",
        };
      }

      const nodeId = engine.addNodeElement(nodeType, props, xywh);
      if (nodeId) {
        engine.selection.setSelection([nodeId]);
      }
    },
    [engine, isLocked],
  );

  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform),
    [],
  );
  const undoShortcut = isMac ? "⌘Z" : "Ctrl+Z";
  const redoShortcut = isMac ? "⌘⇧Z" : "Ctrl+Shift+Z";

  return (
    <div
      data-bottom-bar
      className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        className={cn(
          "pointer-events-auto flex h-11 items-center gap-1 rounded-xl px-2",
          toolbarSurfaceClassName,
        )}
      >
        {/* AI creation buttons */}
        <IconBtn
          title={t("bottomBar.aiImage")}
          onPointerDown={() => createAiNode("image")}
          disabled={isLocked}
          tooltipSide="top"
          showTooltip={false}
          className="h-8 w-auto gap-1.5 whitespace-nowrap px-2.5"
        >
          <ImagePlus size={15} className="flex-shrink-0 text-ol-blue" />
          <span className="text-[11px] font-medium text-ol-text-secondary">
            {t("bottomBar.aiImage")}
          </span>
        </IconBtn>
        <IconBtn
          title={t("bottomBar.aiVideo")}
          onPointerDown={() => createAiNode("video")}
          disabled={isLocked}
          tooltipSide="top"
          showTooltip={false}
          className="h-8 w-auto gap-1.5 whitespace-nowrap px-2.5"
        >
          <VideoIcon size={15} className="flex-shrink-0 text-ol-purple" />
          <span className="text-[11px] font-medium text-ol-text-secondary">
            {t("bottomBar.aiVideo")}
          </span>
        </IconBtn>
        <IconBtn
          title={t("bottomBar.aiAudio")}
          onPointerDown={() => createAiNode("audio")}
          disabled={isLocked}
          tooltipSide="top"
          showTooltip={false}
          className="h-8 w-auto gap-1.5 whitespace-nowrap px-2.5"
        >
          <Music2 size={15} className="flex-shrink-0 text-ol-green" />
          <span className="text-[11px] font-medium text-ol-text-secondary">
            {t("bottomBar.aiAudio")}
          </span>
        </IconBtn>

        <span className="mx-1 h-5 w-px bg-border/60" />

        {/* Undo / Redo */}
        <IconBtn
          title={`${t("controls.undo")} (${undoShortcut})`}
          onPointerDown={handleUndo}
          disabled={isLocked || !snapshot.canUndo}
          tooltipSide="top"
          className="h-7 w-7"
        >
          <Undo2 size={14} />
        </IconBtn>
        <IconBtn
          title={`${t("controls.redo")} (${redoShortcut})`}
          onPointerDown={handleRedo}
          disabled={isLocked || !snapshot.canRedo}
          tooltipSide="top"
          className="h-7 w-7"
        >
          <Redo2 size={14} />
        </IconBtn>

        <span className="mx-1 h-5 w-px bg-border/60" />

        {/* Viewport controls */}
        <IconBtn
          title={t("controls.zoomOut")}
          onPointerDown={startZoomHold("out")}
          disabled={zoom <= zoomLimits.min}
          tooltipSide="top"
          className="h-7 w-7"
        >
          <Minus size={14} />
        </IconBtn>
        <span className="min-w-[38px] select-none text-center text-[11px] font-medium tabular-nums text-ol-text-secondary">
          {zoomPercent}
        </span>
        <IconBtn
          title={t("controls.zoomIn")}
          onPointerDown={startZoomHold("in")}
          disabled={zoom >= zoomLimits.max}
          tooltipSide="top"
          className="h-7 w-7"
        >
          <Plus size={14} />
        </IconBtn>
        <IconBtn
          title={t("bottomBar.fitView")}
          onPointerDown={handleFitView}
          tooltipSide="top"
          className="h-7 w-7"
        >
          <Scan size={14} />
        </IconBtn>
      </div>
    </div>
  );
});

export default BottomBar;
