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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ImageIcon, Music, Sparkles, Video } from "lucide-react";
import { cn } from "@udecode/cn";
import { useTranslation } from "react-i18next";

import { useLayoutState } from "@/hooks/use-layout-state";
import type { CanvasEngine } from "../engine/CanvasEngine";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import {
  BOARD_TEXT_AUXILIARY,
  BOARD_TEXT_PRIMARY,
  BOARD_TEXT_SECONDARY,
} from "../ui/board-style-system";

interface BoardEmptyGuideProps {
  engine: CanvasEngine;
  visible: boolean;
  activeToolId: string | null;
}

/** Built-in example card kinds. Each maps to a small group of empty nodes. */
type ExampleKind = "image" | "video" | "storyboard" | "audio";

interface ExampleCard {
  id: string;
  kind: ExampleKind;
  /** Tailwind gradient classes for the placeholder thumbnail. */
  gradient: string;
  /** Lucide icon for the corner badge. */
  Icon: typeof ImageIcon;
}

const EXAMPLE_CARDS: ExampleCard[] = [
  { id: "ex-1", kind: "image", gradient: "from-slate-700 via-slate-900 to-black", Icon: ImageIcon },
  { id: "ex-2", kind: "image", gradient: "from-amber-700 via-rose-700 to-purple-900", Icon: ImageIcon },
  { id: "ex-3", kind: "storyboard", gradient: "from-sky-600 via-indigo-700 to-violet-900", Icon: Sparkles },
  { id: "ex-4", kind: "video", gradient: "from-emerald-700 via-teal-800 to-slate-900", Icon: Video },
  { id: "ex-5", kind: "audio", gradient: "from-violet-700 via-purple-900 to-black", Icon: Music },
  { id: "ex-6", kind: "storyboard", gradient: "from-orange-600 via-red-700 to-zinc-900", Icon: Sparkles },
];

const NODE_GAP = 80;
const STICKY_SIZE: [number, number] = [200, 200];

/**
 * Empty canvas overlay.
 *
 * The overlay is the first thing a user sees on a blank board. It is built
 * around a single chat input — typing a request and pressing enter opens the
 * right-side chat panel and forwards the message to the agent. A row of
 * example cards below the input lets users drop a small group of empty nodes
 * onto the canvas as a starting point.
 */
const BoardEmptyGuide = memo(function BoardEmptyGuide({
  engine,
  visible,
  activeToolId,
}: BoardEmptyGuideProps) {
  const { t } = useTranslation("board");
  const isSelectTool = activeToolId === "select";
  const setRightChatCollapsed = useLayoutState((s) => s.setRightChatCollapsed);

  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** Forward the draft to the right-side chat panel. */
  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    setRightChatCollapsed(false);
    setDraft("");

    // 等待 ChatInput 在右侧面板挂载后再触发发送
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("openloaf:chat-send-message", { detail: { text } }),
      );
    }, 200);
  }, [draft, setRightChatCollapsed]);

  /** Drop a small group of empty nodes for the chosen example kind. */
  const handlePickExample = useCallback(
    (kind: ExampleKind) => {
      engine.getContainer()?.focus();
      const [cx, cy] = engine.getViewportCenterWorld();
      const [nw, nh] = DEFAULT_NODE_SIZE;
      const ids: (string | null)[] = [];

      const addText = (xywh: [number, number, number, number]) =>
        engine.addNodeElement(
          "text",
          { style: "sticky", stickyColor: "yellow", autoFocus: false },
          xywh,
        );
      const addImage = (xywh: [number, number, number, number]) =>
        engine.addNodeElement(
          "image",
          {
            previewSrc: "",
            originalSrc: "",
            mimeType: "image/png",
            fileName: "",
            naturalWidth: nw,
            naturalHeight: nh,
            origin: "ai-generate",
          },
          xywh,
        );
      const addVideo = (xywh: [number, number, number, number]) =>
        engine.addNodeElement(
          "video",
          { sourcePath: "", fileName: "", origin: "ai-generate" },
          xywh,
        );
      const addAudio = (xywh: [number, number, number, number]) =>
        engine.addNodeElement(
          "audio",
          { sourcePath: "", fileName: "", origin: "ai-generate" },
          xywh,
        );

      if (kind === "image") {
        ids.push(addImage([cx - nw / 2, cy - nh / 2, nw, nh]));
      } else if (kind === "video") {
        const totalW = nw + NODE_GAP + nw;
        const startX = cx - totalW / 2;
        const a = addImage([startX, cy - nh / 2, nw, nh]);
        const b = addVideo([startX + nw + NODE_GAP, cy - nh / 2, nw, nh]);
        ids.push(a, b);
        if (a && b) {
          engine.addConnectorElement({
            source: { elementId: a },
            target: { elementId: b },
            style: "curve",
            dashed: true,
          });
        }
      } else if (kind === "storyboard") {
        const totalW = STICKY_SIZE[0] + NODE_GAP + nw;
        const startX = cx - totalW / 2;
        const imgX = startX + STICKY_SIZE[0] + NODE_GAP;
        const imgGap = 40;
        const totalImgH = nh * 3 + imgGap * 2;
        const imgStartY = cy - totalImgH / 2;
        const text = addText([startX, cy - STICKY_SIZE[1] / 2, STICKY_SIZE[0], STICKY_SIZE[1]]);
        ids.push(text);
        for (let i = 0; i < 3; i++) {
          const img = addImage([imgX, imgStartY + (nh + imgGap) * i, nw, nh]);
          ids.push(img);
          if (text && img) {
            engine.addConnectorElement({
              source: { elementId: text },
              target: { elementId: img },
              style: "curve",
              dashed: true,
            });
          }
        }
      } else {
        // audio: sticky → audio
        const audioH = 120;
        const audioW = 320;
        const totalW = STICKY_SIZE[0] + NODE_GAP + audioW;
        const startX = cx - totalW / 2;
        const text = addText([startX, cy - STICKY_SIZE[1] / 2, STICKY_SIZE[0], STICKY_SIZE[1]]);
        const audio = addAudio([startX + STICKY_SIZE[0] + NODE_GAP, cy - audioH / 2, audioW, audioH]);
        ids.push(text, audio);
        if (text && audio) {
          engine.addConnectorElement({
            source: { elementId: text },
            target: { elementId: audio },
            style: "curve",
            dashed: true,
          });
        }
      }

      const firstId = ids.find((x): x is string => Boolean(x));
      if (firstId) engine.selection.setSelection([firstId]);
    },
    [engine],
  );

  /** ESC dismisses the overlay (the canvas underneath remains empty). */
  const handleSkip = useCallback(() => {
    engine.getContainer()?.focus();
  }, [engine]);

  useEffect(() => {
    if (!visible || !isSelectTool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, isSelectTool, handleSkip]);

  // Random placeholder rotates per mount so the user sees a different example
  // each time they land on a blank canvas.
  const placeholder = useMemo(() => {
    const samples = t("emptyGuide.placeholderSamples", { returnObjects: true }) as
      | string[]
      | string;
    if (Array.isArray(samples) && samples.length > 0) {
      return samples[Math.floor(Math.random() * samples.length)];
    }
    return typeof samples === "string" ? samples : "";
  }, [t]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-30 transition-opacity duration-300",
        visible
          ? isSelectTool
            ? "opacity-100"
            : "opacity-30"
          : "invisible opacity-0",
      )}
    >
      {/* ── Skip link (top-right) ── */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          handleSkip();
        }}
        className={cn(
          "absolute right-6 top-6 select-none rounded-full px-3 py-1.5 text-xs",
          "transition-colors duration-150",
          "hover:bg-foreground/8 dark:hover:bg-foreground/12",
          BOARD_TEXT_SECONDARY,
          isSelectTool ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {t("emptyGuide.skip")} →
      </button>

      {/* ── Centered chat input + heading + examples ── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 -mt-12">
        <div className="flex flex-col items-center gap-2 select-none">
          <p className={cn(BOARD_TEXT_PRIMARY, "text-2xl font-semibold")}>
            {t("emptyGuide.title")}
          </p>
          <p className={cn(BOARD_TEXT_AUXILIARY, "text-sm")}>
            {t("emptyGuide.subtitle")}
          </p>
        </div>

        <div
          data-canvas-toolbar
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "w-full max-w-2xl",
            isSelectTool ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          <div
            className={cn(
              "flex flex-col gap-2 rounded-3xl px-5 py-4",
              "border border-border/70 bg-foreground/[0.04] backdrop-blur-md",
              "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]",
              "transition-colors duration-150",
              "focus-within:border-border",
            )}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={placeholder}
              rows={2}
              className={cn(
                "w-full resize-none bg-transparent outline-none",
                "text-sm leading-relaxed",
                BOARD_TEXT_PRIMARY,
                "placeholder:text-ol-text-auxiliary",
              )}
            />
            <div className="flex items-center justify-end">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleSubmit();
                }}
                disabled={!draft.trim()}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  "bg-foreground text-background",
                  "transition-opacity duration-150",
                  "disabled:opacity-30",
                  "enabled:cursor-pointer enabled:hover:opacity-90",
                )}
                aria-label={t("emptyGuide.send")}
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Example artwork strip ── */}
        {/*
          注意：外层用 w-fit + max-w-5xl（而不是 w-full max-w-5xl）。
          w-full 会让本层撑到容器最大宽度，内部 6 张卡片左对齐排布后会在
          strip 内部留出右侧空白，整体重心偏离 items-center 的居中线，视觉
          上与上方 title/input 不对齐。w-fit 让 strip 按卡片内容收缩，外层
          的 items-center 即可天然把整块居中到和 title/input 对齐的位置。
        */}
        <div
          className={cn(
            "w-fit max-w-5xl flex flex-col gap-2",
            isSelectTool ? "pointer-events-auto" : "pointer-events-none",
          )}
          data-canvas-toolbar
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className={cn("text-xs select-none", BOARD_TEXT_AUXILIARY)}>
            {t("emptyGuide.examplesHeading")}
          </p>
          <div className="flex gap-2.5">
            {EXAMPLE_CARDS.map((card) => {
                const Icon = card.Icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handlePickExample(card.kind);
                    }}
                    className={cn(
                      "group relative shrink-0 overflow-hidden rounded-2xl",
                      "h-24 w-36",
                      "border border-border/30",
                      "transition-all duration-150",
                      "hover:scale-[1.02] hover:border-border/60",
                      "cursor-pointer select-none",
                      `bg-gradient-to-br ${card.gradient}`,
                    )}
                    aria-label={t(`emptyGuide.exampleKind.${card.kind}`)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icon size={26} className="text-white/40" strokeWidth={1.5} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-1.5">
                      <span className="text-[11px] font-medium text-white/90">
                        {t(`emptyGuide.exampleKind.${card.kind}`)}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default BoardEmptyGuide;
