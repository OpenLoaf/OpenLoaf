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

import { memo, useCallback } from "react";
import {
  StickyNote,
  ImagePlus,
  Video,
  FolderOpen,
} from "lucide-react";
import { cn } from "@udecode/cn";
import { useTranslation } from "react-i18next";

import type { CanvasEngine } from "../engine/CanvasEngine";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { toolbarSurfaceClassName } from "../ui/ToolbarParts";
import {
  BOARD_TEXT_PRIMARY,
  BOARD_TEXT_AUXILIARY,
} from "../ui/board-style-system";

interface BoardEmptyGuideProps {
  engine: CanvasEngine;
  visible: boolean;
  activeToolId: string | null;
}

/**
 * Empty canvas guide overlay.
 *
 * Shows a centered card with quick-action buttons, a hint and
 * keyboard shortcuts when the canvas has no elements.
 * Automatically fades when the user starts creating / panning.
 */
const BoardEmptyGuide = memo(function BoardEmptyGuide({
  engine,
  visible,
  activeToolId,
}: BoardEmptyGuideProps) {
  const { t } = useTranslation('board');
  const isSelectTool = activeToolId === "select";

  /** Create a sticky note at the viewport center. */
  const handleCreateSticky = useCallback(() => {
    engine.getContainer()?.focus();
    const center = engine.getViewportCenterWorld();
    const w = 200;
    const h = 200;
    engine.addNodeElement(
      "text",
      { style: "sticky", stickyColor: "yellow", autoFocus: true },
      [center[0] - w / 2, center[1] - h / 2, w, h],
    );
  }, [engine]);

  /** Create an AI image generation node at the viewport center. */
  const handleAiImage = useCallback(() => {
    engine.getContainer()?.focus();
    const viewport = engine.viewport.getState();
    const centerWorld = engine.screenToWorld([
      viewport.size[0] / 2,
      viewport.size[1] / 2,
    ]);
    const [w, h] = DEFAULT_NODE_SIZE;
    const nodeId = engine.addNodeElement(
      "image",
      {
        previewSrc: "",
        originalSrc: "",
        mimeType: "image/png",
        fileName: "ai-generated.png",
        naturalWidth: w,
        naturalHeight: h,
        origin: "ai-generate",
      },
      [centerWorld[0] - w / 2, centerWorld[1] - h / 2, w, h],
    );
    if (nodeId) {
      engine.selection.setSelection([nodeId]);
    }
  }, [engine]);

  /** Create an AI video generation node at the viewport center. */
  const handleAiVideo = useCallback(() => {
    engine.getContainer()?.focus();
    const viewport = engine.viewport.getState();
    const centerWorld = engine.screenToWorld([
      viewport.size[0] / 2,
      viewport.size[1] / 2,
    ]);
    const [w, h] = DEFAULT_NODE_SIZE;
    const nodeId = engine.addNodeElement(
      "video",
      {
        sourcePath: "",
        fileName: "ai-generated.mp4",
        origin: "ai-generate",
      },
      [centerWorld[0] - w / 2, centerWorld[1] - h / 2, w, h],
    );
    if (nodeId) {
      engine.selection.setSelection([nodeId]);
    }
  }, [engine]);

  /** Open the project file picker via custom event. */
  const handleImportFile = useCallback(() => {
    engine.getContainer()?.focus();
    const container = engine.getContainer();
    if (!container) return;
    container.dispatchEvent(
      new CustomEvent("openloaf:board-open-file-picker", { bubbles: true }),
    );
  }, [engine]);

  const actions = [
    {
      id: "sticky",
      icon: StickyNote,
      label: t("emptyGuide.createSticky"),
      iconClass: "text-ol-amber",
      bgClass: "bg-ol-amber-bg hover:bg-ol-amber-bg-hover",
      handler: handleCreateSticky,
    },
    {
      id: "ai-image",
      icon: ImagePlus,
      label: t("emptyGuide.aiImage"),
      iconClass: "text-ol-blue",
      bgClass: "bg-ol-blue-bg hover:bg-ol-blue-bg-hover",
      handler: handleAiImage,
    },
    {
      id: "ai-video",
      icon: Video,
      label: t("emptyGuide.aiVideo"),
      iconClass: "text-ol-purple",
      bgClass: "bg-ol-purple-bg hover:bg-ol-purple-bg-hover",
      handler: handleAiVideo,
    },
    {
      id: "import-file",
      icon: FolderOpen,
      label: t("emptyGuide.importFile"),
      iconClass: "text-ol-green",
      bgClass: "bg-ol-green-bg hover:bg-ol-green-bg-hover",
      handler: handleImportFile,
    },
  ] as const;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-30 transition-opacity duration-300",
        visible ? (isSelectTool ? "opacity-100" : "opacity-30") : "opacity-0 invisible",
      )}
    >
      {/* ── Center card ── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -mt-16">
        {/* Card container */}
        <div
          data-canvas-toolbar
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "flex flex-col items-center gap-5 rounded-2xl px-10 py-8",
            toolbarSurfaceClassName,
            isSelectTool ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          {/* Logo + heading */}
          <div className="flex flex-col items-center gap-1.5 select-none">
            <img
              src="/logo_nobody.png"
              alt="OpenLoaf"
              className="mb-1 h-16 w-16"
            />
            <p className={cn(BOARD_TEXT_PRIMARY, "text-xl font-semibold")}>
              {t("emptyGuide.title")}
            </p>
            <p className={cn(BOARD_TEXT_AUXILIARY, "text-xs")}>
              {t("emptyGuide.subtitle")}
            </p>
          </div>

          {/* Quick action buttons row */}
          <div className="flex items-center gap-3">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    action.handler();
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2",
                    "text-sm font-medium select-none cursor-pointer",
                    "transition-colors duration-150",
                    action.bgClass,
                  )}
                >
                  <Icon size={16} className={action.iconClass} />
                  <span className={action.iconClass}>{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* Hint text */}
          <p className={cn(BOARD_TEXT_AUXILIARY, "text-xs select-none")}>
            {t("emptyGuide.hint")}
          </p>

          {/* Keyboard shortcuts */}
          <div className="flex items-center gap-2 select-none">
            {[
              { key: "V", label: t("tools.select") },
              { key: "H", label: t("tools.hand") },
              { key: "T", label: t("insertTools.text") },
              { key: "C", label: t("tools.connector") },
            ].map((shortcut, i) => (
              <span key={shortcut.key} className="flex items-center gap-1">
                {i > 0 && (
                  <span className={cn(BOARD_TEXT_AUXILIARY, "text-xs mx-0.5")}>
                    ·
                  </span>
                )}
                <kbd
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded px-1",
                    "text-[10px] font-mono font-medium",
                    "bg-foreground/8 text-ol-text-secondary",
                    "dark:bg-foreground/12",
                  )}
                >
                  {shortcut.key}
                </kbd>
                <span className={cn(BOARD_TEXT_AUXILIARY, "text-[11px]")}>
                  {shortcut.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default BoardEmptyGuide;
