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
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import type { ConnectionValidation } from "../engine/connection-validator";
import { cn } from "@udecode/cn";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  SELECTED_ANCHOR_EDGE_SIZE,
  SELECTED_ANCHOR_EDGE_SIZE_HOVER,
  SELECTED_ANCHOR_GAP,
  SELECTED_ANCHOR_SIDE_SIZE,
  SELECTED_ANCHOR_SIDE_SIZE_HOVER,
} from "../engine/constants";
import { LARGE_ANCHOR_NODE_TYPES } from "../engine/anchorTypes";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";

type AnchorOverlayItem = CanvasAnchorHit & {
  /** Anchor source used for styling offsets. */
  origin: "connector" | "hover" | "selected";
};

type AnchorOverlayProps = {
  /** Current snapshot for anchor rendering. */
  snapshot: CanvasSnapshot;
};

/**
 * Render anchor handles above nodes for linking.
 *
 * 渲染在 WorldAnchorLayer（与 DomNodeLayer 相同的 RAF transform 层）内部，
 * 使用世界坐标定位 + counter-scale 保持恒定屏幕尺寸，与节点零帧差同步。
 */
export function AnchorOverlay({ snapshot }: AnchorOverlayProps) {
  if (snapshot.selectedIds.length > 1) {
    return null;
  }
  const zoom = snapshot.viewport.zoom;
  const groupPadding = getGroupOutlinePadding(zoom);
  const hoverAnchor = snapshot.connectorHover;
  const selectedAnchors = getSelectedImageAnchors(snapshot);
  const hoverAnchors = getHoveredImageAnchors(snapshot);
  if (!hoverAnchor && selectedAnchors.length === 0 && hoverAnchors.length === 0) {
    return null;
  }

  const anchors: AnchorOverlayItem[] = [];
  selectedAnchors.forEach(anchor => {
    anchors.push({ ...anchor, origin: "selected" });
  });
  hoverAnchors.forEach(anchor => {
    anchors.push({ ...anchor, origin: "hover" });
  });
  const uniqueAnchors = new Map<string, AnchorOverlayItem>();
  anchors.forEach(anchor => {
    const key = `${anchor.elementId}-${anchor.anchorId}`;
    const existing = uniqueAnchors.get(key);
    if (!existing || anchor.origin === "selected" || anchor.origin === "hover") {
      uniqueAnchors.set(key, anchor);
      return;
    }
    if (existing.origin !== "selected" && anchor.origin === "connector") {
      uniqueAnchors.set(key, anchor);
    }
  });

  const connectorValidation = snapshot.connectorValidation;
  const isDrafting = snapshot.connectorDraft !== null;

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
            <div
              className={cn(
                "absolute flex items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
                validationClass ?? (
                  isHover
                    ? "bg-[var(--canvas-connector-anchor-hover)]"
                    : "bg-[var(--canvas-connector-anchor)]"
                ),
                validationClass ? "border-transparent" : "border-[var(--canvas-connector-handle-fill)]"
              )}
              style={{
                left: anchorOffset[0],
                top: anchorOffset[1],
                width: size,
                height: size,
                marginLeft: -size / 2,
                marginTop: -size / 2,
              }}
            >
              {isSideAnchor && useSelectedStyle ? (
                <>
                  <Plus
                    size={iconSize}
                    className={cn(
                      "absolute text-[var(--canvas-connector-handle-fill)] transition-opacity duration-150",
                      isHover ? "opacity-0" : "opacity-100"
                    )}
                    strokeWidth={2.2}
                  />
                  {anchor.anchorId === "left" ? (
                    <ChevronLeft
                      size={10}
                      className={cn(
                        "absolute text-[var(--canvas-connector-handle-fill)] transition-opacity duration-150",
                        isHover ? "opacity-100" : "opacity-0"
                      )}
                      strokeWidth={2.5}
                    />
                  ) : (
                    <ChevronRight
                      size={10}
                      className={cn(
                        "absolute text-[var(--canvas-connector-handle-fill)] transition-opacity duration-150",
                        isHover ? "opacity-100" : "opacity-0"
                      )}
                      strokeWidth={2.5}
                    />
                  )}
                </>
              ) : null}
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

/** Collect anchors for selected large-anchor nodes. */
function getSelectedImageAnchors(snapshot: CanvasSnapshot): CanvasAnchorHit[] {
  if (snapshot.selectedIds.length === 0) return [];
  const selectedAnchors: CanvasAnchorHit[] = [];
  snapshot.selectedIds.forEach(selectedId => {
    const element = snapshot.elements.find(item => item.id === selectedId);
    if (!element || element.kind !== "node") return;
    if (!LARGE_ANCHOR_NODE_TYPES.has(element.type)) return;
    const anchors = snapshot.anchors[selectedId];
    if (!anchors) return;
    anchors.forEach(anchor => {
      // 逻辑：大锚点节点选中时仅保留左右锚点。
      if (anchor.id !== "left" && anchor.id !== "right") return;
      selectedAnchors.push({
        elementId: selectedId,
        anchorId: anchor.id,
        point: anchor.point as CanvasPoint,
      });
    });
  });
  return selectedAnchors;
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
  if (snapshot.selectedIds.includes(hoverNodeId)) return [];
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
