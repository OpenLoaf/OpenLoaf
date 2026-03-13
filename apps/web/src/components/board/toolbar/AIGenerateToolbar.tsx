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

import { memo, useMemo, type ReactNode } from "react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  Eye as PhEye,
  ImageSquare as PhImageSquare,
  FilmSlate as PhFilmSlate,
} from "@phosphor-icons/react";
import { Sparkles } from "lucide-react";
import { cn } from "@udecode/cn";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasSnapshot } from "../engine/types";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "../nodes/imagePromptGenerate";
import { IMAGE_GENERATE_NODE_TYPE } from "../nodes/imageGenerate";
import { VIDEO_GENERATE_NODE_TYPE } from "../nodes/videoGenerate";
import { CHAT_INPUT_NODE_TYPE } from "../nodes/chatInput";
import {
  BOARD_TOOLBAR_SURFACE_CLASS,
  BOARD_GENERATE_BTN_PROMPT,
  BOARD_GENERATE_BTN_IMAGE,
  BOARD_GENERATE_BTN_VIDEO,
  BOARD_GENERATE_BTN_CHAT,
  BOARD_GENERATE_SELECTED_PROMPT,
  BOARD_GENERATE_SELECTED_IMAGE,
  BOARD_GENERATE_SELECTED_VIDEO,
  BOARD_GENERATE_SELECTED_CHAT,
} from "../ui/board-style-system";

type AIToolItem = {
  id: string;
  icon: ComponentType<IconProps>;
  renderIcon?: (active: boolean) => ReactNode;
  label: string;
  nodeType: string;
  props?: Record<string, unknown>;
  size: [number, number];
  /** Idle style — semantic colored background + text. */
  colorClass: string;
  /** Active/selected style — semantic border ring. */
  activeClass: string;
};


export interface AIGenerateToolbarProps {
  engine: CanvasEngine;
  snapshot: CanvasSnapshot;
}

const AIGenerateToolbar = memo(function AIGenerateToolbar({
  engine,
  snapshot,
}: AIGenerateToolbarProps) {
  const { t } = useTranslation('board');
  const isLocked = snapshot.locked;
  const pendingInsert = snapshot.pendingInsert;

  const aiTools = useMemo<AIToolItem[]>(() => [
    {
      id: CHAT_INPUT_NODE_TYPE,
      icon: PhEye,
      renderIcon: (active: boolean) => <Sparkles size={20} strokeWidth={active ? 2.5 : 2} />,
      label: t('aiToolbar.aiAssistant'),
      nodeType: CHAT_INPUT_NODE_TYPE,
      props: { autoFocus: true, status: "idle" },
      size: [360, 200],
      colorClass: BOARD_GENERATE_BTN_CHAT,
      activeClass: BOARD_GENERATE_SELECTED_CHAT,
    },
    {
      id: IMAGE_PROMPT_GENERATE_NODE_TYPE,
      icon: PhEye,
      label: t('aiToolbar.imagePromptGenerate'),
      nodeType: IMAGE_PROMPT_GENERATE_NODE_TYPE,
      size: [320, 220],
      colorClass: BOARD_GENERATE_BTN_PROMPT,
      activeClass: BOARD_GENERATE_SELECTED_PROMPT,
    },
    {
      id: IMAGE_GENERATE_NODE_TYPE,
      icon: PhImageSquare,
      label: t('aiToolbar.imageGenerate'),
      nodeType: IMAGE_GENERATE_NODE_TYPE,
      size: [320, 260],
      colorClass: BOARD_GENERATE_BTN_IMAGE,
      activeClass: BOARD_GENERATE_SELECTED_IMAGE,
    },
    {
      id: VIDEO_GENERATE_NODE_TYPE,
      icon: PhFilmSlate,
      label: t('aiToolbar.videoGenerate'),
      nodeType: VIDEO_GENERATE_NODE_TYPE,
      size: [360, 280],
      colorClass: BOARD_GENERATE_BTN_VIDEO,
      activeClass: BOARD_GENERATE_SELECTED_VIDEO,
    },
  ], [t]);

  return (
    <div
      data-canvas-toolbar
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "pointer-events-auto absolute right-4 top-1/2 z-20 -translate-y-1/2",
        "flex flex-col rounded-lg py-2 px-1.5 gap-1.5",
        BOARD_TOOLBAR_SURFACE_CLASS,
      )}
    >
      {aiTools.map((item) => {
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
                props: item.props ?? {},
                size: item.size,
              });
            }}
            className={cn(
              "flex w-18 flex-col items-center gap-1 px-2 py-2 rounded-md transition-all duration-150 select-none",
              isActive
                ? cn(item.colorClass, "border", item.activeClass)
                : cn(item.colorClass, "border border-transparent"),
            )}
          >
            {item.renderIcon ? item.renderIcon(isActive) : <Icon size={20} weight={isActive ? "fill" : "duotone"} />}
            <span className="text-[10px] leading-tight text-center font-medium">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default AIGenerateToolbar;
