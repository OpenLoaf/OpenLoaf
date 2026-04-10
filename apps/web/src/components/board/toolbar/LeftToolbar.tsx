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

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";
import {
  Image,
  Video,
  Music,
  FileText,
  Link,
  StickyNote,
  Table2,
  Upload,
  MousePointer2,
  Hand,
  Plus,
  LayoutTemplate,
  Pen,
  Highlighter,
  Eraser,
  Download,
} from "lucide-react";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasInsertRequest, CanvasSnapshot } from "../engine/types";
import { IconBtn, toolbarSurfaceClassName } from "../ui/ToolbarParts";
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/text-node-constants";
import { DEFAULT_NODE_SIZE } from "../engine/constants";

export interface LeftToolbarProps {
  engine: CanvasEngine;
  snapshot: CanvasSnapshot;
}

const SHORTCUTS: Record<string, string> = {
  select: "V",
  hand: "H",
  text: "T",
  pen: "P",
  highlighter: "K",
  eraser: "E",
};

function buildTitle(label: string, key: string): string {
  const shortcut = SHORTCUTS[key];
  return shortcut ? `${label} (${shortcut})` : label;
}

// ---------------------------------------------------------------------------
// SidePanel — 外层 wrapper 始终 pointer-events-auto 以保持 hover 桥，
// 内层内容在关闭时 pointer-events-none 防止点击穿透。
// ---------------------------------------------------------------------------

function SidePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [offsetY, setOffsetY] = useState(0);

  // 逻辑：面板打开后测量是否溢出视口底部，如果溢出则向上偏移。
  // 保留 12px 底部安全边距，避免紧贴视口边缘。
  useLayoutEffect(() => {
    if (!open) {
      setOffsetY(0);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 80;
    const overflow = rect.bottom - (window.innerHeight - margin);
    setOffsetY(overflow > 0 ? -overflow : 0);
  }, [open]);

  return (
    <div
      ref={panelRef}
      className={cn(
        // 逻辑：外层 wrapper 用 pl-2 padding 创建透明桥，
        // 鼠标从按钮滑到面板时不会离开父 relative div 的后代。
        // 关闭时必须 pointer-events-none，否则不可见区域会
        // 提前拦截鼠标导致面板意外弹出。
        "absolute left-full top-0 z-50 pl-4",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      style={offsetY ? { top: offsetY } : undefined}
    >
      <div
        className={cn(
          "w-[220px] rounded-3xl py-2",
          toolbarSurfaceClassName,
          "transition-all duration-150 ease-out origin-top-left",
          open
            ? "opacity-100 scale-100 translate-x-0"
            : "opacity-0 scale-95 -translate-x-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Section heading inside a SidePanel. */
function PanelSection({ title }: { title: string }) {
  return (
    <h4 className="px-3.5 pt-2.5 pb-1.5 text-[13px] font-semibold text-ol-text-secondary">
      {title}
    </h4>
  );
}

/** Panel item — icon + title + optional description. */
function PanelItem({
  icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      onPointerDown={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "group flex w-full items-center gap-3 px-3.5 py-2",
        "transition-colors duration-100 rounded-3xl mx-0",
        active
          ? "bg-foreground/10 text-ol-blue dark:bg-foreground/15"
          : "hover:bg-foreground/6 dark:hover:bg-foreground/8",
      )}
    >
      <span className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-3xl",
        "bg-foreground/5 dark:bg-foreground/8",
        "transition-colors duration-100",
        "group-hover:bg-foreground/8 dark:group-hover:bg-foreground/12",
        active && "bg-ol-blue-bg text-ol-blue dark:bg-ol-blue-bg",
      )}>
        {icon}
      </span>
      <div className="flex flex-col items-start gap-0.5 min-w-0">
        <span className="text-[13px] font-medium leading-tight">{title}</span>
        {description && (
          <span className="text-[11px] leading-tight text-ol-text-auxiliary truncate max-w-[160px]">
            {description}
          </span>
        )}
      </div>
    </button>
  );
}

const DRAW_TOOL_IDS = ["pen", "highlighter", "eraser"] as const;

/** Left vertical toolbar. */
const LeftToolbar = memo(function LeftToolbar({
  engine,
  snapshot,
}: LeftToolbarProps) {
  const { t } = useTranslation("board");
  const [insertPanelOpen, setInsertPanelOpen] = useState(false);
  const [drawPanelOpen, setDrawPanelOpen] = useState(false);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);

  const activeToolId = snapshot.activeToolId;
  const isLocked = snapshot.locked;
  const isDrawToolActive = DRAW_TOOL_IDS.includes(activeToolId as typeof DRAW_TOOL_IDS[number]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  const closeAllPanels = useCallback(() => {
    setInsertPanelOpen(false);
    setDrawPanelOpen(false);
    setTemplatePanelOpen(false);
  }, []);

  const handleToolChange = useCallback(
    (toolId: string) => {
      if (isLocked && toolId !== "select" && toolId !== "hand") return;
      engine.setActiveTool(toolId);
      closeAllPanels();
    },
    [engine, isLocked, closeAllPanels],
  );

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // 逻辑：hover 事件只在父 relative div 上处理。
  // SidePanel 外层 wrapper 始终 pointer-events-auto，
  // 所以鼠标在 SidePanel 上时，不会触发父 div 的 pointerLeave。
  const makeHoverHandlers = useCallback(
    (
      openSetter: React.Dispatch<React.SetStateAction<boolean>>,
      otherSetters: React.Dispatch<React.SetStateAction<boolean>>[],
    ) => ({
      onPointerEnter: () => {
        clearHoverTimer();
        if (!isLocked) {
          openSetter(true);
          for (const s of otherSetters) s(false);
        }
      },
      onPointerLeave: () => {
        hoverTimerRef.current = window.setTimeout(() => {
          openSetter(false);
          hoverTimerRef.current = null;
        }, 300);
      },
    }),
    [isLocked, clearHoverTimer],
  );

  const insertHover = makeHoverHandlers(setInsertPanelOpen, [setDrawPanelOpen, setTemplatePanelOpen]);
  const drawHover = makeHoverHandlers(setDrawPanelOpen, [setInsertPanelOpen, setTemplatePanelOpen]);
  const templateHover = makeHoverHandlers(setTemplatePanelOpen, [setInsertPanelOpen, setDrawPanelOpen]);

  const handleInsertRequest = useCallback(
    (request: CanvasInsertRequest) => {
      if (isLocked) return;
      engine.getContainer()?.focus();
      engine.setPendingInsert(request);
      closeAllPanels();
    },
    [engine, isLocked, closeAllPanels],
  );

  /** Place an AI generation node in pending-insert mode. */
  const placeAiNode = useCallback(
    (nodeType: "image" | "video" | "audio") => {
      if (isLocked) return;
      const [w, h] = DEFAULT_NODE_SIZE;
      let props: Record<string, unknown> = {};
      if (nodeType === "image") {
        props = {
          previewSrc: "", originalSrc: "", mimeType: "image/png",
          fileName: "", naturalWidth: w, naturalHeight: h,
          origin: "ai-generate",
        };
      } else if (nodeType === "video") {
        props = { sourcePath: "", fileName: "", origin: "ai-generate" };
      } else {
        props = { sourcePath: "", fileName: "", origin: "ai-generate" };
      }
      handleInsertRequest({
        id: `ai-${nodeType}`,
        type: nodeType,
        props,
        size: nodeType === 'audio' ? [320, 120] : [w, h],
        title: t(`insertTools.${nodeType}`),
      });
    },
    [isLocked, handleInsertRequest, t],
  );

  const iconSize = 20;
  const panelIconSize = 16;

  return (
    <div
      data-left-toolbar
      className="absolute left-3 top-1/2 z-20 -translate-y-1/2"
      onPointerDown={(event) => { event.stopPropagation(); }}
    >
      <div
        className={cn(
          "pointer-events-auto flex w-14 flex-col items-center gap-1.5 rounded-3xl px-2.5 py-2.5",
          toolbarSurfaceClassName,
        )}
      >
        {/* Select (V) */}
        <IconBtn
          title={buildTitle(t("tools.select"), "select")}
          active={activeToolId === "select"}
          onPointerDown={() => handleToolChange("select")}
          tooltipSide="right"
          className="h-9 w-9 !text-foreground"
        >
          <MousePointer2 size={iconSize} />
        </IconBtn>

        {/* Hand (H) */}
        <IconBtn
          title={buildTitle(t("tools.hand"), "hand")}
          active={activeToolId === "hand"}
          onPointerDown={() => handleToolChange("hand")}
          tooltipSide="right"
          className="h-9 w-9 !text-foreground"
        >
          <Hand size={iconSize} />
        </IconBtn>

        <span className="my-0.5 h-px w-7 bg-border/60" />

        {/* Insert (+) — hover opens the full insert panel */}
        <div
          className="relative"
          {...insertHover}
        >
          <IconBtn
            title={t("tools.insert")}
            active={insertPanelOpen}
            onPointerDown={() => {
              if (!isLocked) setInsertPanelOpen((prev) => !prev);
            }}
            tooltipSide="right"
            showTooltip={false}
            disabled={isLocked}
            className="h-9 w-9 !bg-foreground !text-background hover:!bg-foreground"
          >
            <span className={cn("inline-flex transition-all duration-200 ease-out", insertPanelOpen && "rotate-45")}>
              <Plus size={iconSize} />
            </span>
          </IconBtn>
          <SidePanel open={insertPanelOpen}>
            {/* ── 添加节点 ── */}
            <PanelSection title={t("insertTools.addNode") || "添加节点"} />
            <PanelItem
              icon={<StickyNote size={panelIconSize} />}
              title={t("insertTools.text")}
              description={t("insertTools.textDesc") || undefined}
              active={snapshot.pendingInsert?.type === "text"}
              onClick={() => {
                handleInsertRequest({
                  id: "text-sticky",
                  type: "text",
                  props: { autoFocus: true, style: "sticky", stickyColor: "yellow" },
                  size: [200, TEXT_NODE_DEFAULT_HEIGHT],
                  title: t("insertTools.text"),
                });
              }}
            />
            <PanelItem
              icon={<Image size={panelIconSize} />}
              title={t("insertTools.image")}
              description={t("insertTools.imageDesc") || undefined}
              onClick={() => placeAiNode("image")}
            />
            <PanelItem
              icon={<Video size={panelIconSize} />}
              title={t("insertTools.video")}
              description={t("insertTools.videoDesc") || undefined}
              onClick={() => placeAiNode("video")}
            />
            <PanelItem
              icon={<Music size={panelIconSize} />}
              title={t("insertTools.audio")}
              description={t("insertTools.audioDesc") || undefined}
              onClick={() => placeAiNode("audio")}
            />
            <PanelItem
              icon={<Table2 size={panelIconSize} />}
              title={t("insertTools.table")}
              description={t("insertTools.tableDesc") || undefined}
              active={snapshot.pendingInsert?.type === "table"}
              onClick={() => {
                handleInsertRequest({
                  id: "table",
                  type: "table",
                  props: {},
                  size: [400, 200],
                  title: t("insertTools.table"),
                });
              }}
            />

            {/* ── 添加资源 ── */}
            <PanelSection title={t("insertTools.addResource") || "添加资源"} />
            <PanelItem
              icon={<Upload size={panelIconSize} />}
              title={t("insertTools.upload") || "上传"}
              description={t("insertTools.uploadDesc") || undefined}
              onClick={() => {
                engine
                  .getContainer()
                  ?.dispatchEvent(new Event("openloaf:board-open-file-picker"));
                setInsertPanelOpen(false);
              }}
            />
            <PanelItem
              icon={<Download size={panelIconSize} />}
              title={t("insertTools.videoDownload") || "视频下载"}
              description={t("insertTools.videoDownloadDesc") || undefined}
              onClick={() => {
                engine
                  .getContainer()
                  ?.dispatchEvent(new Event("openloaf:board-video-url-download"));
                setInsertPanelOpen(false);
              }}
            />
            <PanelItem
              icon={<Link size={panelIconSize} />}
              title={t("insertTools.link")}
              description={t("insertTools.linkDesc") || undefined}
              onClick={() => {
                handleInsertRequest({
                  id: "link",
                  type: "link",
                  props: {
                    url: "", title: "", description: "",
                    logoSrc: "", imageSrc: "", refreshToken: Date.now(),
                  },
                  size: [280, 160],
                });
              }}
            />
          </SidePanel>
        </div>

        <span className="my-0.5 h-px w-7 bg-border/60" />

        {/* Pen / Highlighter / Eraser */}
        <div
          className="relative"
          {...drawHover}
        >
          <IconBtn
            title={buildTitle(t("tools.pen"), "pen")}
            active={isDrawToolActive}
            onPointerDown={() => handleToolChange(activeToolId === "pen" ? "highlighter" : "pen")}
            tooltipSide="right"
            showTooltip={!drawPanelOpen}
            disabled={isLocked}
            className="h-9 w-9 !text-foreground"
          >
            {activeToolId === "highlighter" ? (
              <Highlighter size={iconSize} />
            ) : activeToolId === "eraser" ? (
              <Eraser size={iconSize} />
            ) : (
              <Pen size={iconSize} />
            )}
          </IconBtn>
          <SidePanel open={drawPanelOpen}>
            <PanelItem
              icon={<Pen size={panelIconSize} />}
              title={buildTitle(t("tools.pen"), "pen")}
              active={activeToolId === "pen"}
              onClick={() => handleToolChange("pen")}
            />
            <PanelItem
              icon={<Highlighter size={panelIconSize} />}
              title={buildTitle(t("tools.highlighter"), "highlighter")}
              active={activeToolId === "highlighter"}
              onClick={() => handleToolChange("highlighter")}
            />
            <PanelItem
              icon={<Eraser size={panelIconSize} />}
              title={buildTitle(t("tools.eraser"), "eraser")}
              active={activeToolId === "eraser"}
              onClick={() => handleToolChange("eraser")}
            />
          </SidePanel>
        </div>

        {/* Template — hover opens a coming-soon panel */}
        <div
          className="relative"
          {...templateHover}
        >
          <IconBtn
            title={t("tools.template")}
            active={templatePanelOpen}
            onPointerDown={() => {
              if (!isLocked) setTemplatePanelOpen((prev) => !prev);
            }}
            tooltipSide="right"
            showTooltip={!templatePanelOpen}
            className="h-9 w-9 !text-foreground"
          >
            <LayoutTemplate size={iconSize} />
          </IconBtn>
          <SidePanel open={templatePanelOpen}>
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/5 dark:bg-foreground/8">
                <LayoutTemplate size={24} className="text-ol-text-auxiliary" />
              </div>
              <span className="text-[13px] font-semibold text-ol-text-secondary">
                {t("tools.templateComingSoon")}
              </span>
              <span className="mt-1.5 text-[11px] leading-relaxed text-ol-text-auxiliary">
                {t("tools.templateComingSoonDesc")}
              </span>
            </div>
          </SidePanel>
        </div>
      </div>
    </div>
  );
});

export default LeftToolbar;
