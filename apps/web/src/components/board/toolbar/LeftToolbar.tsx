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
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";
import {
  Image,
  Video,
  Music,
  FileText,
  Link,
  StickyNote,
  MousePointer2,
  Hand,
  Type,
  Plus,
  Spline,
} from "lucide-react";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasInsertRequest, CanvasSnapshot } from "../engine/types";
import { IconBtn, toolbarSurfaceClassName } from "../ui/ToolbarParts";
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/TextNode";

export interface LeftToolbarProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for tool state. */
  snapshot: CanvasSnapshot;
}

/** Shortcut mapping for tooltips. */
const SHORTCUTS: Record<string, string> = {
  select: "V",
  hand: "H",
  text: "T",
  insert: "I",
  connector: "C",
};

/** Build a tooltip label with shortcut suffix. */
function buildTitle(label: string, key: string): string {
  const shortcut = SHORTCUTS[key];
  return shortcut ? `${label} (${shortcut})` : label;
}

/** Side popup panel for left toolbar — pops out to the right. */
function SidePanel(props: {
  open: boolean;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const { open, children, onMouseEnter, onMouseLeave } = props;
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "pointer-events-auto absolute left-full top-0 z-50 ml-2",
        "rounded-lg p-1.5",
        toolbarSurfaceClassName,
        "transition-all duration-150 ease-out",
        open
          ? "opacity-100 translate-x-0"
          : "pointer-events-none opacity-0 -translate-x-2",
      )}
    >
      {children}
    </div>
  );
}

/** Horizontal panel item (icon left, label right). */
function SidePanelItem(props: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const { label, icon, active, onClick } = props;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs",
        "transition-colors duration-150",
        active
          ? "bg-foreground/10 text-ol-blue dark:bg-foreground/15"
          : "hover:bg-foreground/8 dark:hover:bg-foreground/10",
      )}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/** Left vertical toolbar with 5 primary tools. */
const LeftToolbar = memo(function LeftToolbar({
  engine,
  snapshot,
}: LeftToolbarProps) {
  const { t } = useTranslation("board");
  const [insertPanelOpen, setInsertPanelOpen] = useState(false);
  const [textPanelOpen, setTextPanelOpen] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);

  const activeToolId = snapshot.activeToolId;
  const isLocked = snapshot.locked;

  // 逻辑：组件卸载时清理 hover 定时器，防止在已卸载组件上调用 setState。
  useEffect(
    () => () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  const handleToolChange = useCallback(
    (toolId: string) => {
      if (isLocked && toolId !== "select" && toolId !== "hand") return;
      engine.setActiveTool(toolId);
      setInsertPanelOpen(false);
      setTextPanelOpen(false);
    },
    [engine, isLocked],
  );

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const handleTextEnter = useCallback(() => {
    clearHoverTimer();
    if (!isLocked) {
      setTextPanelOpen(true);
      setInsertPanelOpen(false);
    }
  }, [isLocked, clearHoverTimer]);

  const handleTextLeave = useCallback(() => {
    hoverTimerRef.current = window.setTimeout(() => {
      setTextPanelOpen(false);
      hoverTimerRef.current = null;
    }, 200);
  }, []);

  const handleInsertEnter = useCallback(() => {
    clearHoverTimer();
    if (!isLocked) {
      setInsertPanelOpen(true);
      setTextPanelOpen(false);
    }
  }, [isLocked, clearHoverTimer]);

  const handleInsertLeave = useCallback(() => {
    hoverTimerRef.current = window.setTimeout(() => {
      setInsertPanelOpen(false);
      hoverTimerRef.current = null;
    }, 200);
  }, []);

  /** Emit a pending insert request for one-shot placement. */
  const handleInsertRequest = useCallback(
    (request: CanvasInsertRequest) => {
      if (isLocked) return;
      engine.getContainer()?.focus();
      engine.setPendingInsert(request);
      setInsertPanelOpen(false);
      setTextPanelOpen(false);
    },
    [engine, isLocked],
  );

  const iconSize = 18;

  return (
    <div
      data-left-toolbar
      className="absolute left-3 top-1/2 z-20 -translate-y-1/2"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        className={cn(
          "pointer-events-auto flex w-12 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5",
          toolbarSurfaceClassName,
        )}
      >
        {/* Select (V) */}
        <IconBtn
          title={buildTitle(t("tools.select"), "select")}
          active={activeToolId === "select"}
          onPointerDown={() => handleToolChange("select")}
          tooltipSide="right"
          className="h-9 w-9"
        >
          <MousePointer2 size={iconSize} />
        </IconBtn>

        {/* Hand (H) */}
        <IconBtn
          title={buildTitle(t("tools.hand"), "hand")}
          active={activeToolId === "hand"}
          onPointerDown={() => handleToolChange("hand")}
          tooltipSide="right"
          className="h-9 w-9"
        >
          <Hand size={iconSize} />
        </IconBtn>

        <span className="my-0.5 h-px w-6 bg-border/60" />

        {/* Text (T) — hover opens sub-panel */}
        <div
          className="relative"
          onPointerEnter={handleTextEnter}
          onPointerLeave={handleTextLeave}
        >
          <IconBtn
            title={buildTitle(t("insertTools.text"), "text")}
            active={
              activeToolId === "text" ||
              snapshot.pendingInsert?.type === "text"
            }
            onPointerDown={() => {
              handleInsertRequest({
                id: "text-plain",
                type: "text",
                props: { autoFocus: true, style: "plain" },
                size: [200, TEXT_NODE_DEFAULT_HEIGHT],
                title: t("insertTools.text"),
              });
            }}
            tooltipSide="right"
            showTooltip={!textPanelOpen}
            disabled={isLocked}
            className="h-9 w-9"
          >
            <Type size={iconSize} />
          </IconBtn>
          <SidePanel
            open={textPanelOpen}
            onMouseEnter={handleTextEnter}
            onMouseLeave={handleTextLeave}
          >
            <SidePanelItem
              label={t("insertTools.text")}
              icon={<Type size={14} />}
              active={snapshot.pendingInsert?.id === "text-plain"}
              onClick={() => {
                handleInsertRequest({
                  id: "text-plain",
                  type: "text",
                  props: { autoFocus: true, style: "plain" },
                  size: [200, TEXT_NODE_DEFAULT_HEIGHT],
                  title: t("insertTools.text"),
                });
              }}
            />
            <SidePanelItem
              label={t("insertTools.sticky")}
              icon={<StickyNote size={14} />}
              active={snapshot.pendingInsert?.id === "text-sticky"}
              onClick={() => {
                handleInsertRequest({
                  id: "text-sticky",
                  type: "text",
                  props: {
                    autoFocus: true,
                    style: "sticky",
                    stickyColor: "yellow",
                  },
                  size: [200, 200],
                  title: t("insertTools.sticky"),
                });
              }}
            />
          </SidePanel>
        </div>

        {/* Insert (+) */}
        <div
          className="relative"
          onPointerEnter={handleInsertEnter}
          onPointerLeave={handleInsertLeave}
        >
          <IconBtn
            title={buildTitle(t("tools.insert"), "insert")}
            active={insertPanelOpen}
            onPointerDown={() => {
              if (!isLocked) setInsertPanelOpen(!insertPanelOpen);
            }}
            tooltipSide="right"
            showTooltip={!insertPanelOpen}
            disabled={isLocked}
            className="h-9 w-9"
          >
            <Plus size={iconSize} />
          </IconBtn>
          <SidePanel
            open={insertPanelOpen}
            onMouseEnter={handleInsertEnter}
            onMouseLeave={handleInsertLeave}
          >
            <SidePanelItem
              label={t("insertTools.image")}
              icon={<Image size={14} />}
              onClick={() => {
                engine
                  .getContainer()
                  ?.dispatchEvent(
                    new Event("openloaf:board-open-file-picker"),
                  );
                setInsertPanelOpen(false);
              }}
            />
            <SidePanelItem
              label={t("insertTools.video")}
              icon={<Video size={14} />}
              onClick={() => {
                engine
                  .getContainer()
                  ?.dispatchEvent(
                    new Event("openloaf:board-open-file-picker"),
                  );
                setInsertPanelOpen(false);
              }}
            />
            <SidePanelItem
              label={t("insertTools.audio")}
              icon={<Music size={14} />}
              onClick={() => {
                engine
                  .getContainer()
                  ?.dispatchEvent(
                    new Event("openloaf:board-open-file-picker"),
                  );
                setInsertPanelOpen(false);
              }}
            />
            <SidePanelItem
              label={t("insertTools.file")}
              icon={<FileText size={14} />}
              onClick={() => {
                engine
                  .getContainer()
                  ?.dispatchEvent(
                    new Event("openloaf:board-open-file-picker"),
                  );
                setInsertPanelOpen(false);
              }}
            />
            <SidePanelItem
              label={t("insertTools.link")}
              icon={<Link size={14} />}
              onClick={() => {
                handleInsertRequest({
                  id: "link",
                  type: "link",
                  props: {
                    url: "",
                    title: "",
                    description: "",
                    logoSrc: "",
                    imageSrc: "",
                    refreshToken: Date.now(),
                  },
                  size: [280, 160],
                });
              }}
            />
          </SidePanel>
        </div>

        <span className="my-0.5 h-px w-6 bg-border/60" />

        {/* Connector (C) */}
        <IconBtn
          title={buildTitle(t("tools.connector"), "connector")}
          active={activeToolId === "connector"}
          onPointerDown={() => handleToolChange("connector")}
          tooltipSide="right"
          disabled={isLocked}
          className="h-9 w-9"
        >
          <Spline size={iconSize} />
        </IconBtn>
      </div>
    </div>
  );
});

export default LeftToolbar;
