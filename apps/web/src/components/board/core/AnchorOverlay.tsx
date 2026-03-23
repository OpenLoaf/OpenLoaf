/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasAnchorHit,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type { ConnectionValidation } from "../engine/connection-validator";
import { cn } from "@udecode/cn";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import {
  SELECTED_ANCHOR_EDGE_SIZE,
  SELECTED_ANCHOR_EDGE_SIZE_HOVER,
  SELECTED_ANCHOR_GAP,
  SELECTED_ANCHOR_SIDE_SIZE,
  SELECTED_ANCHOR_SIDE_SIZE_HOVER,
} from "../engine/constants";
import { LARGE_ANCHOR_NODE_TYPES } from "../engine/anchorTypes";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
import { useAnchorMagnetic } from "./useAnchorMagnetic";

type AnchorOverlayItem = CanvasAnchorHit & {
  /** Anchor source used for styling offsets. */
  origin: "connector" | "hover";
};

type AnchorOverlayProps = {
  /** Current snapshot for anchor rendering. */
  snapshot: CanvasSnapshot;
  /** Canvas engine instance for reading cursor position. */
  engine: CanvasEngine;
};

/**
 * Render anchor handles above nodes for linking.
 *
 * 渲染在 WorldAnchorLayer（与 DomNodeLayer 相同的 RAF transform 层）内部，
 * 使用世界坐标定位 + counter-scale 保持恒定屏幕尺寸，与节点零帧差同步。
 *
 * 磁吸动画：鼠标靠近锚点时图标跟随鼠标（clamped），离开时弹性回弹。
 */
export function AnchorOverlay({ snapshot, engine }: AnchorOverlayProps) {
  const zoom = snapshot.viewport.zoom;
  const groupPadding = getGroupOutlinePadding(zoom);
  const hoverAnchor = snapshot.connectorHover;
  const isDrafting = snapshot.connectorDraft !== null;
  const hoverAnchors = isDrafting ? [] : getHoveredImageAnchors(snapshot);

  const uniqueAnchors = useMemo(() => {
    const map = new Map<string, AnchorOverlayItem>();
    hoverAnchors.forEach(anchor => {
      const key = `${anchor.elementId}-${anchor.anchorId}`;
      map.set(key, { ...anchor, origin: "hover" });
    });
    return map;
  }, [hoverAnchors]);

  // 逻辑：为磁吸 hook 准备锚点列表（包含世界坐标）。
  const magneticAnchors = useMemo(() => {
    return hoverAnchors.map(a => ({
      anchorId: a.anchorId,
      worldPoint: resolveGroupAnchorPoint(a, snapshot, groupPadding),
    }));
  }, [hoverAnchors, snapshot, groupPadding]);

  const magneticActive = hoverAnchors.length > 0;
  const { setRef } = useAnchorMagnetic(engine, magneticActive, magneticAnchors);

  if (!hoverAnchor && hoverAnchors.length === 0) {
    return null;
  }

  const connectorValidation = snapshot.connectorValidation;

  return (
    <>
      {Array.from(uniqueAnchors.values()).map(anchor => {
        const adjustedPoint = resolveGroupAnchorPoint(anchor, snapshot, groupPadding);
        const isHover =
          hoverAnchor?.elementId === anchor.elementId &&
          hoverAnchor.anchorId === anchor.anchorId;
        const isSideAnchor = anchor.anchorId === "left" || anchor.anchorId === "right";
        const useSelectedStyle = anchor.origin !== "connector";
        const baseSize = useSelectedStyle
          ? isSideAnchor
            ? SELECTED_ANCHOR_SIDE_SIZE
            : SELECTED_ANCHOR_EDGE_SIZE
          : 7;
        const hoverSize = useSelectedStyle
          ? isSideAnchor
            ? SELECTED_ANCHOR_SIDE_SIZE_HOVER
            : SELECTED_ANCHOR_EDGE_SIZE_HOVER
          : 11;
        const size = isHover ? hoverSize : baseSize;
        const iconSize = isHover ? 18 : 16;
        // 逻辑：选中锚点外扩保持固定距离，避免 hover 时跳动。
        const offsetDistance =
          useSelectedStyle ? baseSize / 2 + SELECTED_ANCHOR_GAP : 0;
        const anchorOffset = resolveAnchorScreenOffset(anchor.anchorId, offsetDistance);

        // 逻辑：连线拖拽中，对悬停锚点根据验证结果着色：合法绿色，类型不兼容红色，无结果保持默认。
        const validationClass = resolveAnchorValidationClass(
          isHover,
          isDrafting,
          connectorValidation,
        );

        return (
          <div
            key={`${anchor.elementId}-${anchor.anchorId}`}
            className="absolute"
            style={{
              left: adjustedPoint[0],
              top: adjustedPoint[1],
              transform: `scale(${1 / zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* 逻辑：磁吸动画容器 — transform 由 useAnchorMagnetic RAF 直接操作 ref。 */}
            <div
              ref={(el) => setRef(anchor.anchorId, el)}
              className="absolute"
              style={{
                left: anchorOffset[0],
                top: anchorOffset[1],
              }}
            >
              <div
                className={cn(
                  "absolute flex items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.12)] transition-[width,height] duration-150",
                  validationClass ?? (
                    isHover
                      ? "bg-[var(--canvas-connector-anchor-hover)]"
                      : "bg-[var(--canvas-connector-anchor)]"
                  ),
                  validationClass ? "border-transparent" : "border-[var(--canvas-connector-handle-fill)]"
                )}
                style={{
                  width: size,
                  height: size,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                }}
              >
                {isSideAnchor && useSelectedStyle ? (
                  <Plus
                    size={iconSize}
                    className="text-[var(--canvas-connector-handle-fill)]"
                    strokeWidth={2.2}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Resolve the screen-space offset for a specific anchor id. */
function resolveAnchorScreenOffset(anchorId: string, distance: number): CanvasPoint {
  switch (anchorId) {
    case "top":
      return [0, -distance];
    case "right":
      return [distance, 0];
    case "bottom":
      return [0, distance];
    case "left":
      return [-distance, 0];
    default:
      return [0, 0];
  }
}

/** Resolve anchor points for group nodes with outline padding. */
function resolveGroupAnchorPoint(
  anchor: CanvasAnchorHit,
  snapshot: CanvasSnapshot,
  padding: number
): CanvasPoint {
  const element = snapshot.elements.find(item => item.id === anchor.elementId);
  if (!element || element.kind !== "node" || !isGroupNodeType(element.type)) {
    return anchor.point;
  }
  // 逻辑：组节点锚点按外扩边框位置偏移，保持连线起点对齐。
  const offset = resolveAnchorScreenOffset(anchor.anchorId, padding);
  return [anchor.point[0] + offset[0], anchor.point[1] + offset[1]];
}

/**
 * Resolve the Tailwind class for connector drag validation feedback on a hovered anchor.
 * Returns null when no colored feedback should be applied (use default styling).
 */
function resolveAnchorValidationClass(
  isHover: boolean,
  isDrafting: boolean,
  validation: ConnectionValidation | null,
): string | null {
  // 逻辑：只在连线拖拽中、鼠标悬停的目标锚点上显示验证色，其余锚点保持默认样式。
  if (!isHover || !isDrafting || validation === null) return null;
  if (validation.valid) {
    return "bg-green-500/20 border-green-500 ring-1 ring-green-500";
  }
  // type-incompatible → 红色提示；self-loop 也用红色。
  return "bg-red-500/20 border-red-500 ring-1 ring-red-500";
}

/** Collect anchors for hovered large-anchor nodes. */
function getHoveredImageAnchors(snapshot: CanvasSnapshot): CanvasAnchorHit[] {
  const hoverNodeId = snapshot.nodeHoverId;
  if (!hoverNodeId) return [];
  const element = snapshot.elements.find(item => item.id === hoverNodeId);
  if (
    !element ||
    element.kind !== "node" ||
    !LARGE_ANCHOR_NODE_TYPES.has(element.type)
  ) {
    return [];
  }
  const anchors = snapshot.anchors[hoverNodeId];
  if (!anchors) return [];
  const hoveredAnchors: CanvasAnchorHit[] = [];
  anchors.forEach(anchor => {
    // 逻辑：大锚点节点悬停时仅展示左右锚点。
    if (anchor.id !== "left" && anchor.id !== "right") return;
    hoveredAnchors.push({
      elementId: hoverNodeId,
      anchorId: anchor.id,
      point: anchor.point as CanvasPoint,
    });
  });
  return hoveredAnchors;
}
