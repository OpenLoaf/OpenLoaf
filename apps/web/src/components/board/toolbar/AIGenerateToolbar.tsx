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

import { memo } from "react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  Scan as PhScan,
  Sparkle as PhSparkle,
  FilmSlate as PhFilmSlate,
} from "@phosphor-icons/react";
import { cn } from "@udecode/cn";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasSnapshot } from "../engine/types";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "../nodes/imagePromptGenerate";
import { IMAGE_GENERATE_NODE_TYPE } from "../nodes/imageGenerate";
import { VIDEO_GENERATE_NODE_TYPE } from "../nodes/videoGenerate";
import {
  BOARD_TOOLBAR_SURFACE_CLASS,
  BOARD_GENERATE_BTN_PROMPT,
  BOARD_GENERATE_BTN_IMAGE,
  BOARD_GENERATE_BTN_VIDEO,
  BOARD_GENERATE_SELECTED_PROMPT,
  BOARD_GENERATE_SELECTED_IMAGE,
  BOARD_GENERATE_SELECTED_VIDEO,
} from "../ui/board-style-system";

type AIToolItem = {
  id: string;
  icon: ComponentType<IconProps>;
  label: string;
  nodeType: string;
  size: [number, number];
  /** Idle style — semantic colored background + text. */
  colorClass: string;
  /** Active/selected style — semantic border ring. */
  activeClass: string;
};

const AI_TOOLS: AIToolItem[] = [
  {
    id: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    icon: PhScan,
    label: "图片理解",
    nodeType: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    size: [320, 220],
    colorClass: BOARD_GENERATE_BTN_PROMPT,
    activeClass: BOARD_GENERATE_SELECTED_PROMPT,
  },
  {
    id: IMAGE_GENERATE_NODE_TYPE,
    icon: PhSparkle,
    label: "图片生成",
    nodeType: IMAGE_GENERATE_NODE_TYPE,
    size: [320, 260],
    colorClass: BOARD_GENERATE_BTN_IMAGE,
    activeClass: BOARD_GENERATE_SELECTED_IMAGE,
  },
  {
    id: VIDEO_GENERATE_NODE_TYPE,
    icon: PhFilmSlate,
    label: "生成视频",
    nodeType: VIDEO_GENERATE_NODE_TYPE,
    size: [360, 280],
    colorClass: BOARD_GENERATE_BTN_VIDEO,
    activeClass: BOARD_GENERATE_SELECTED_VIDEO,
  },
];

export interface AIGenerateToolbarProps {
  engine: CanvasEngine;
  snapshot: CanvasSnapshot;
}

const AIGenerateToolbar = memo(function AIGenerateToolbar({
  engine,
  snapshot,
}: AIGenerateToolbarProps) {
  const isLocked = snapshot.locked;
  const pendingInsert = snapshot.pendingInsert;

  return (
    <div
      data-canvas-toolbar
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "pointer-events-auto absolute right-4 top-1/2 z-20 -translate-y-1/2",
        "flex flex-col rounded-2xl py-2 px-1.5 gap-1.5",
        BOARD_TOOLBAR_SURFACE_CLASS,
      )}
    >
      {AI_TOOLS.map((item) => {
        const Icon = item.icon;
        const isActive = pendingInsert?.id === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              if (isLocked) return;
              engine.getContainer()?.focus();
              if (pendingInsert?.id === item.id) {
                engine.setPendingInsert(null);
                return;
              }
              engine.setPendingInsert({
                id: item.id,
                type: item.nodeType,
                props: {},
                size: item.size,
              });
            }}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-150 select-none",
              isActive
                ? cn(item.colorClass, "border", item.activeClass)
                : cn(item.colorClass, "border border-transparent"),
            )}
          >
            <Icon size={20} weight={isActive ? "fill" : "duotone"} />
            <span className="text-[10px] leading-none whitespace-nowrap font-medium">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default AIGenerateToolbar;
