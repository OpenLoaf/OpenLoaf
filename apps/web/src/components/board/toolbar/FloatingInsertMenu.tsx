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

import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";
import {
  Image,
  Video,
  Music,
  StickyNote,
  Upload,
  Link,
} from "lucide-react";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasPoint, CanvasSnapshot } from "../engine/types";
import { toolbarSurfaceClassName } from "../ui/ToolbarParts";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/text-node-constants";

/** Custom event name for opening the floating insert menu. */
export const FLOATING_INSERT_MENU_EVENT = "openloaf:board-floating-insert-menu";

type MenuState = {
  clientX: number;
  clientY: number;
  worldPoint: CanvasPoint;
} | null;

export type FloatingInsertMenuProps = {
  engine: CanvasEngine;
  snapshot: CanvasSnapshot;
  containerRef: RefObject<HTMLDivElement | null>;
};

/** Floating insert menu that appears at the double-click position on blank canvas. */
const FloatingInsertMenu = memo(function FloatingInsertMenu({
  engine,
  snapshot,
  containerRef,
}: FloatingInsertMenuProps) {
  const { t } = useTranslation("board");
  const [state, setState] = useState<MenuState>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isLocked = snapshot.locked;

  // 逻辑：监听画布双击空白区域派发的自定义事件，在鼠标位置显示插入菜单。
  // 使用 containerRef.current 而非 engine.getContainer()，因为子组件
  // 的 useEffect 执行早于父组件的 engine.attach()，此时 engine 容器尚未设置。
  // containerRef.current 在 commit 阶段即已赋值，不受 effect 执行顺序影响。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (event: Event) => {
      if (isLocked) return;
      const ce = event as CustomEvent<{
        clientX: number;
        clientY: number;
        worldPoint: CanvasPoint;
      }>;
      setState(ce.detail);
    };
    container.addEventListener(FLOATING_INSERT_MENU_EVENT, handler);
    return () =>
      container.removeEventListener(FLOATING_INSERT_MENU_EVENT, handler);
  }, [containerRef, isLocked]);

  // 逻辑：点击菜单外部或按 Escape 时关闭菜单。
  // 使用 rAF 延迟注册，避免双击事件本身的 pointerdown 立即触发关闭。
  useEffect(() => {
    if (!state) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setState(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setState(null);
      }
    };
    const id = requestAnimationFrame(() => {
      window.addEventListener("pointerdown", handlePointerDown, true);
      window.addEventListener("keydown", handleKeyDown, true);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [state]);

  const close = useCallback(() => setState(null), []);

  const placeNode = useCallback(
    (type: string, props: Record<string, unknown>, size: [number, number]) => {
      if (!state) return;
      const [w, h] = size;
      const xywh: [number, number, number, number] = [
        state.worldPoint[0] - w / 2,
        state.worldPoint[1] - h / 2,
        w,
        h,
      ];
      // DEBUG: 节点放置坐标追踪
      console.log('[board-place] state.worldPoint:', state.worldPoint);
      console.log('[board-place] node xywh:', xywh);
      console.log('[board-place] viewport:', engine.viewport.getState());
      // 预期屏幕中心位置
      const { offset, zoom } = engine.viewport.getState();
      const expectedScreenCenter = [
        state.worldPoint[0] * zoom + offset[0],
        state.worldPoint[1] * zoom + offset[1],
      ];
      console.log('[board-place] expected screen center of node:', expectedScreenCenter);
      console.log('[board-place] original clientX/Y:', state.clientX, state.clientY);
      engine.addNodeElement(type, props, xywh);
      close();
    },
    [engine, state, close],
  );

  const placeAiNode = useCallback(
    (nodeType: "image" | "video" | "audio") => {
      if (!state) return;
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
      placeNode(nodeType, props, nodeType === 'audio' ? [320, 120] : [w, h]);
    },
    [state, placeNode],
  );

  if (!state) return null;

  // 逻辑：菜单定位时避免溢出视口右边缘或下边缘。
  const menuW = 220;
  const menuH = 340;
  const adjustedX =
    state.clientX + menuW > window.innerWidth
      ? state.clientX - menuW
      : state.clientX;
  const adjustedY =
    state.clientY + menuH > window.innerHeight
      ? state.clientY - menuH
      : state.clientY;

  const iconSize = 16;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 pointer-events-auto"
      style={{ left: adjustedX, top: adjustedY }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          "w-[220px] rounded-3xl py-2",
          toolbarSurfaceClassName,
        )}
      >
        {/* ── 添加节点 ── */}
        <h4 className="px-3.5 pt-2.5 pb-1.5 text-[13px] font-semibold text-ol-text-secondary">
          {t("insertTools.addNode") || "添加节点"}
        </h4>
        <MenuItem
          icon={<StickyNote size={iconSize} />}
          title={t("insertTools.text")}
          description={t("insertTools.textDesc") || undefined}
          onClick={() =>
            placeNode(
              "text",
              { autoFocus: true, style: "sticky", stickyColor: "yellow" },
              [200, TEXT_NODE_DEFAULT_HEIGHT],
            )
          }
        />
        <MenuItem
          icon={<Image size={iconSize} />}
          title={t("insertTools.image")}
          description={t("insertTools.imageDesc") || undefined}
          onClick={() => placeAiNode("image")}
        />
        <MenuItem
          icon={<Video size={iconSize} />}
          title={t("insertTools.video")}
          description={t("insertTools.videoDesc") || undefined}
          onClick={() => placeAiNode("video")}
        />
        <MenuItem
          icon={<Music size={iconSize} />}
          title={t("insertTools.audio")}
          description={t("insertTools.audioDesc") || undefined}
          onClick={() => placeAiNode("audio")}
        />

        {/* ── 添加资源 ── */}
        <h4 className="px-3.5 pt-2.5 pb-1.5 text-[13px] font-semibold text-ol-text-secondary">
          {t("insertTools.addResource") || "添加资源"}
        </h4>
        <MenuItem
          icon={<Upload size={iconSize} />}
          title={t("insertTools.upload") || "上传"}
          description={t("insertTools.uploadDesc") || undefined}
          onClick={() => {
            engine
              .getContainer()
              ?.dispatchEvent(new Event("openloaf:board-open-file-picker"));
            close();
          }}
        />
        <MenuItem
          icon={<Link size={iconSize} />}
          title={t("insertTools.link")}
          description={t("insertTools.linkDesc") || undefined}
          onClick={() =>
            placeNode(
              "link",
              {
                url: "", title: "", description: "",
                logoSrc: "", imageSrc: "", refreshToken: Date.now(),
              },
              [360, 120],
            )
          }
        />
      </div>
    </div>
  );
});

/** Menu item — identical style to LeftToolbar's PanelItem. */
function MenuItem({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
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
        "hover:bg-foreground/6 dark:hover:bg-foreground/8",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-3xl",
          "bg-foreground/5 dark:bg-foreground/8",
          "transition-colors duration-100",
          "group-hover:bg-foreground/8 dark:group-hover:bg-foreground/12",
        )}
      >
        {icon}
      </span>
      <div className="flex flex-col items-start gap-0.5 min-w-0">
        <span className="text-[13px] font-medium leading-tight">{title}</span>
        {description && (
          <span className="max-h-0 overflow-hidden opacity-0 group-hover:max-h-5 group-hover:opacity-100 transition-all duration-150 ease-out text-[11px] leading-tight text-ol-text-auxiliary truncate max-w-[140px]">
            {description}
          </span>
        )}
      </div>
    </button>
  );
}

export default FloatingInsertMenu;
