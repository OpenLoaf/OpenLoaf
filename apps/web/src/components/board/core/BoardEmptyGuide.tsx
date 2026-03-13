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

import { memo, useCallback, useMemo } from "react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  Scan as PhScan,
  Sparkle as PhSparkle,
  FilmSlate as PhFilmSlate,
  TextAa as PhTextAa,
} from "@phosphor-icons/react";
import { cn } from "@udecode/cn";
import { useTranslation } from "react-i18next";

import type { CanvasEngine } from "../engine/CanvasEngine";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "../nodes/imagePromptGenerate";
import { IMAGE_GENERATE_NODE_TYPE } from "../nodes/imageGenerate";
import { VIDEO_GENERATE_NODE_TYPE } from "../nodes/videoGenerate";
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/TextNode";
import {
  BOARD_TEXT_PRIMARY,
  BOARD_TEXT_AUXILIARY,
  BOARD_GENERATE_DOT_PROMPT,
  BOARD_GENERATE_DOT_IMAGE,
  BOARD_GENERATE_DOT_VIDEO,
} from "../ui/board-style-system";

interface BoardEmptyGuideProps {
  engine: CanvasEngine;
  visible: boolean;
  activeToolId: string | null;
}

type TemplateItem = {
  id: string;
  icon: ComponentType<IconProps>;
  label: string;
  desc: string;
  /** Semantic dot class for the accent indicator. */
  dotClass: string;
  /** Background tint for the card. */
  bgClass: string;
  /** Border tint on hover. */
  hoverBorderClass: string;
  /** Icon color class. */
  iconClass: string;
  /** Node type to insert, or null for special actions. */
  nodeType: string;
  /** Default node size [w, h]. */
  size: [number, number];
};

/**
 * Empty canvas guide overlay.
 *
 * Shows inline toolbar annotations and a central template selector
 * when the canvas has no elements.
 */
const BoardEmptyGuide = memo(function BoardEmptyGuide({
  engine,
  visible,
  activeToolId,
}: BoardEmptyGuideProps) {
  const { t } = useTranslation('board');
  const isSelectTool = activeToolId === "select";

  const templates = useMemo<TemplateItem[]>(() => [
    {
      id: 'tpl-image-gen',
      icon: PhSparkle,
      label: t('emptyGuide.tpl.imageGen.label'),
      desc: t('emptyGuide.tpl.imageGen.desc'),
      dotClass: BOARD_GENERATE_DOT_IMAGE,
      bgClass: 'bg-ol-blue-bg/60',
      hoverBorderClass: 'hover:border-ol-blue/40',
      iconClass: 'text-ol-blue',
      nodeType: IMAGE_GENERATE_NODE_TYPE,
      size: [320, 260],
    },
    {
      id: 'tpl-image-prompt',
      icon: PhScan,
      label: t('emptyGuide.tpl.imagePrompt.label'),
      desc: t('emptyGuide.tpl.imagePrompt.desc'),
      dotClass: BOARD_GENERATE_DOT_PROMPT,
      bgClass: 'bg-ol-amber-bg/60',
      hoverBorderClass: 'hover:border-ol-amber/40',
      iconClass: 'text-ol-amber',
      nodeType: IMAGE_PROMPT_GENERATE_NODE_TYPE,
      size: [320, 220],
    },
    {
      id: 'tpl-video-gen',
      icon: PhFilmSlate,
      label: t('emptyGuide.tpl.videoGen.label'),
      desc: t('emptyGuide.tpl.videoGen.desc'),
      dotClass: BOARD_GENERATE_DOT_VIDEO,
      bgClass: 'bg-ol-purple-bg/50',
      hoverBorderClass: 'hover:border-ol-purple/40',
      iconClass: 'text-ol-purple',
      nodeType: VIDEO_GENERATE_NODE_TYPE,
      size: [360, 280],
    },
    {
      id: 'tpl-text',
      icon: PhTextAa,
      label: t('emptyGuide.tpl.text.label'),
      desc: t('emptyGuide.tpl.text.desc'),
      dotClass: 'bg-ol-text-primary',
      bgClass: 'bg-ol-surface-muted/60',
      hoverBorderClass: 'hover:border-ol-text-auxiliary/40',
      iconClass: 'text-ol-text-auxiliary',
      nodeType: 'text',
      size: [280, TEXT_NODE_DEFAULT_HEIGHT],
    },
  ], [t]);

  const handleTemplate = useCallback(
    (tpl: TemplateItem) => {
      engine.getContainer()?.focus();
      const [w, h] = tpl.size;
      const center = engine.getViewportCenterWorld();
      engine.addNodeElement(tpl.nodeType, {}, [
        center[0] - w / 2,
        center[1] - h / 2,
        w,
        h,
      ]);
    },
    [engine],
  );

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-30 transition-opacity duration-300",
        visible ? (isSelectTool ? "opacity-100" : "opacity-30") : "opacity-0 invisible",
      )}
    >
      {/* ── Center: template selector ── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -mt-28">
        {/* Heading */}
        <div className="flex flex-col items-center gap-1.5 select-none mb-6">
          <img
            src="/logo_nobody.png"
            alt="OpenLoaf"
            className="mb-2 h-24 w-24"
          />
          <p className={cn(BOARD_TEXT_PRIMARY, "text-2xl font-medium")}>
            {t('emptyGuide.heading')}
          </p>
          <p className={cn(BOARD_TEXT_AUXILIARY, "text-sm")}>
            {t('emptyGuide.subheading')}
          </p>
        </div>

        {/* Template cards grid */}
        <div
          data-canvas-toolbar
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "grid w-[50%] grid-cols-4 gap-[2%]",
            isSelectTool ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
            {templates.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onPointerDown={() => handleTemplate(tpl)}
                  className={cn(
                    "group flex w-full flex-col items-center gap-3 rounded-lg border border-transparent px-[8%] py-[16%]",
                    "transition-all duration-150 cursor-pointer select-none",
                    tpl.bgClass,
                    tpl.hoverBorderClass,
                    "hover:shadow-sm",
                  )}
                >
                  <div className="relative">
                    <Icon
                      size={40}
                      weight="duotone"
                      className={cn(
                        tpl.iconClass,
                        "transition-transform duration-150 group-hover:scale-110",
                      )}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        BOARD_TEXT_PRIMARY,
                        "text-sm font-medium whitespace-nowrap",
                      )}
                    >
                      {tpl.label}
                    </span>
                    <span
                      className={cn(
                        BOARD_TEXT_AUXILIARY,
                        "text-xs leading-tight text-center",
                      )}
                    >
                      {tpl.desc}
                    </span>
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
});

export default BoardEmptyGuide;
