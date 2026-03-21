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

import { memo, useCallback, useState } from "react";
import {
  StickyNote,
  Image,
  Video,
  Music,
  Upload,
  LayoutTemplate,
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
import WorkflowTemplatePicker from "../templates/WorkflowTemplatePicker";

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
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

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

  /** Create an AI generation node at the viewport center. */
  const handleAiNode = useCallback(
    (nodeType: "image" | "video" | "audio") => {
      engine.getContainer()?.focus();
      const viewport = engine.viewport.getState();
      const centerWorld = engine.screenToWorld([
        viewport.size[0] / 2,
        viewport.size[1] / 2,
      ]);
      const [w, h] = DEFAULT_NODE_SIZE;
      let props: Record<string, unknown>;
      if (nodeType === "image") {
        props = {
          previewSrc: "", originalSrc: "", mimeType: "image/png",
          fileName: "", naturalWidth: w, naturalHeight: h,
          origin: "ai-generate",
        };
      } else {
        props = { sourcePath: "", fileName: "", origin: "ai-generate" };
      }
      const size: [number, number] = nodeType === "audio" ? [320, 120] : [w, h];
      const nodeId = engine.addNodeElement(
        nodeType, props,
        [centerWorld[0] - size[0] / 2, centerWorld[1] - size[1] / 2, size[0], size[1]],
      );
      if (nodeId) engine.selection.setSelection([nodeId]);
    },
    [engine],
  );

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
    { id: "text", icon: StickyNote, label: t("emptyGuide.createText"), handler: handleCreateSticky },
    { id: "ai-image", icon: Image, label: t("emptyGuide.aiImage"), handler: () => handleAiNode("image") },
    { id: "ai-video", icon: Video, label: t("emptyGuide.aiVideo"), handler: () => handleAiNode("video") },
    { id: "ai-audio", icon: Music, label: t("emptyGuide.aiAudio"), handler: () => handleAiNode("audio") },
    { id: "import-file", icon: Upload, label: t("emptyGuide.importFile"), handler: handleImportFile },
    { id: "template", icon: LayoutTemplate, label: t("emptyGuide.fromTemplate"), handler: () => setShowTemplatePicker(true) },
  ];


  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-30 transition-opacity duration-300",
        visible ? (isSelectTool ? "opacity-100" : "opacity-30") : "opacity-0 invisible",
      )}
    >
      {/* ── Center card ── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -mt-12">
        <div
          data-canvas-toolbar
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "flex flex-col items-center gap-5 rounded-3xl px-8 py-7",
            toolbarSurfaceClassName,
            isSelectTool ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          {/* Heading */}
          <div className="flex flex-col items-center gap-1 select-none">
            <p className={cn(BOARD_TEXT_PRIMARY, "text-lg font-semibold")}>
              {t("emptyGuide.title")}
            </p>
            <p className={cn(BOARD_TEXT_AUXILIARY, "text-xs")}>
              {t("emptyGuide.subtitle")}
            </p>
          </div>

          {/* Quick action cards — 6-item grid */}
          <div className="grid grid-cols-6 gap-1.5">
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
                    "flex flex-col items-center justify-center gap-1.5",
                    "w-[72px] rounded-2xl px-2 py-3",
                    "select-none cursor-pointer",
                    "transition-colors duration-150",
                    "bg-foreground/5 hover:bg-foreground/12",
                    "dark:bg-foreground/8 dark:hover:bg-foreground/16",
                  )}
                >
                  <span className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl",
                    "bg-foreground/6 dark:bg-foreground/10",
                  )}>
                    <Icon size={16} className="text-foreground/70" />
                  </span>
                  <span className="text-[11px] font-medium text-ol-text-secondary leading-tight">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hint text */}
          <p className={cn(BOARD_TEXT_AUXILIARY, "text-[11px] select-none")}>
            {t("emptyGuide.hint")}
          </p>
        </div>
      </div>

      {/* ── Template picker overlay ── */}
      {showTemplatePicker && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-40">
          <WorkflowTemplatePicker
            engine={engine}
            onClose={() => setShowTemplatePicker(false)}
          />
        </div>
      )}
    </div>
  );
});

export default BoardEmptyGuide;
