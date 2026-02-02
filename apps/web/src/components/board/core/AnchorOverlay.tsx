import type {
  CanvasAnchorHit,
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import { cn } from "@udecode/cn";
import { Fragment } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  SELECTED_ANCHOR_EDGE_SIZE,
  SELECTED_ANCHOR_EDGE_SIZE_HOVER,
  SELECTED_ANCHOR_GAP,
  SELECTED_ANCHOR_SIDE_SIZE,
  SELECTED_ANCHOR_SIDE_SIZE_HOVER,
} from "../engine/constants";
import { MINDMAP_META } from "../engine/mindmap-layout";
import { toScreenPoint } from "../utils/coordinates";
import { LARGE_ANCHOR_NODE_TYPES } from "../engine/anchorTypes";
import { getGroupOutlinePadding, isGroupNodeType } from "../engine/grouping";
import { useBoardEngine } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";

type AnchorOverlayItem = CanvasAnchorHit & {
  /** Anchor source used for styling offsets. */
  origin: "connector" | "hover" | "selected";
};

type AnchorOverlayProps = {
  /** Current snapshot for anchor rendering. */
  snapshot: CanvasSnapshot;
};

/** Render anchor handles above nodes for linking. */
export function AnchorOverlay({ snapshot }: AnchorOverlayProps) {
  // 逻辑：视图变化时独立刷新锚点位置，避免全量快照重算。
  if (snapshot.selectedIds.length > 1) {
    return null;
  }
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  const groupPadding = getGroupOutlinePadding(viewState.viewport.zoom);
  const mindmapLayoutDirection = engine.getMindmapLayoutDirection();
  const hoverAnchor = snapshot.connectorHover;
  const hoverNodeId = snapshot.nodeHoverId;
  const selectedAnchors = getSelectedImageAnchors(snapshot);
  const hoverAnchors = getHoveredImageAnchors(snapshot);
  if (!hoverAnchor && selectedAnchors.length === 0 && hoverAnchors.length === 0) {
    return null;
  }
  const collapseTargets = getMindmapCollapseTargets(
    snapshot,
    mindmapLayoutDirection,
    hoverNodeId
  );

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

  return (
    <div
      data-board-anchor-overlay
      className="pointer-events-none absolute inset-0 z-20"
    >
      {Array.from(uniqueAnchors.values()).map(anchor => {
        const adjustedPoint = resolveGroupAnchorPoint(anchor, snapshot, groupPadding);
        const screen = toScreenPoint(adjustedPoint, viewState);
        const element = snapshot.elements.find(
          (item): item is CanvasNodeElement =>
            item.kind === "node" && item.id === anchor.elementId
        );
        const isTextNode = element?.type === "text";
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
        const iconSize = isHover ? 16 : 14;
        // 逻辑：选中锚点外扩保持固定距离，避免 hover 时跳动。
        const offsetDistance =
          useSelectedStyle ? baseSize / 2 + SELECTED_ANCHOR_GAP : 0;
        const offset = resolveAnchorScreenOffset(anchor.anchorId, offsetDistance);
        const collapseTarget = collapseTargets.get(anchor.elementId);
        const showCollapse =
          Boolean(collapseTarget)
          && collapseTarget!.anchorId === anchor.anchorId
          && useSelectedStyle;
        const anchorCenter: CanvasPoint = [
          screen[0] + offset[0],
          screen[1] + offset[1],
        ];
        const buttonSize = 20;
        const buttonGap = 6;
        const buttonDistance = baseSize / 2 + buttonGap + buttonSize / 2;
        const buttonOffset: CanvasPoint = isTextNode
          ? [0, 0]
          : resolveAnchorScreenOffset(anchor.anchorId, buttonDistance);
        return (
          <Fragment key={`${anchor.elementId}-${anchor.anchorId}`}>
            {!isTextNode ? (
              <div
                className={cn(
                  "absolute flex items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
                  isHover
                    ? "bg-[var(--canvas-connector-anchor-hover)]"
                    : "bg-[var(--canvas-connector-anchor)]",
                  "border-[var(--canvas-connector-handle-fill)]"
                )}
                style={{
                  left: anchorCenter[0],
                  top: anchorCenter[1],
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
            ) : null}
            {showCollapse ? (
              <button
                type="button"
                className={cn(
                  "pointer-events-auto absolute flex h-5 w-5 items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm",
                  "border-slate-200 hover:bg-slate-50"
                )}
                style={{
                  left: anchorCenter[0] + buttonOffset[0],
                  top: anchorCenter[1] + buttonOffset[1],
                  marginLeft: -buttonSize / 2,
                  marginTop: -buttonSize / 2,
                }}
                onPointerDown={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  engine.toggleMindmapCollapse(anchor.elementId);
                }}
                title={collapseTarget!.collapsed ? "展开" : "折叠"}
              >
                {collapseTarget!.collapsed ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

/** Check whether the anchor belongs to a selected large-anchor node. */
function isSelectedLargeAnchorNode(
  elementId: string,
  snapshot: CanvasSnapshot
): boolean {
  if (!snapshot.selectedIds.includes(elementId)) return false;
  const element = snapshot.elements.find(item => item.id === elementId);
  return (
    element?.kind === "node" && LARGE_ANCHOR_NODE_TYPES.has(element.type)
  );
}

/** Check whether the anchor belongs to a hovered large-anchor node. */
function isHoverLargeAnchorNode(
  elementId: string,
  snapshot: CanvasSnapshot
): boolean {
  const hoverNodeId = snapshot.nodeHoverId;
  if (!hoverNodeId || hoverNodeId !== elementId) return false;
  if (snapshot.selectedIds.includes(elementId)) return false;
  const element = snapshot.elements.find(item => item.id === elementId);
  return (
    element?.kind === "node" && LARGE_ANCHOR_NODE_TYPES.has(element.type)
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

type MindmapLayoutDirection = "right" | "left" | "balanced";
type MindmapCollapseTarget = {
  anchorId: "left" | "right";
  collapsed: boolean;
};

/** Collect mindmap collapse anchors for nodes with children. */
function getMindmapCollapseTargets(
  snapshot: CanvasSnapshot,
  layoutDirection: MindmapLayoutDirection,
  hoverNodeId?: string | null
): Map<string, MindmapCollapseTarget> {
  const targets = new Map<string, MindmapCollapseTarget>();
  snapshot.elements.forEach(element => {
    if (element.kind !== "node") return;
    if (!snapshot.selectedIds.includes(element.id)) return;
    const meta = element.meta as Record<string, unknown> | undefined;
    if (Boolean(meta?.[MINDMAP_META.ghost])) return;
    if (Boolean(meta?.[MINDMAP_META.multiParent])) return;
    const childCount =
      typeof meta?.[MINDMAP_META.childCount] === "number"
        ? (meta?.[MINDMAP_META.childCount] as number)
        : 0;
    if (childCount <= 0) return;
    const anchorId = resolveMindmapCollapseAnchor(
      element,
      snapshot,
      layoutDirection
    );
    const collapsed = Boolean(meta?.[MINDMAP_META.collapsed]);
    targets.set(element.id, { anchorId, collapsed });
  });
  if (hoverNodeId && !snapshot.selectedIds.includes(hoverNodeId)) {
    const element = snapshot.elements.find(
      (item): item is CanvasNodeElement =>
        item.kind === "node" && item.id === hoverNodeId
    );
    if (!element || element.type !== "text") return targets;
    const meta = element.meta as Record<string, unknown> | undefined;
    if (Boolean(meta?.[MINDMAP_META.ghost])) return targets;
    if (Boolean(meta?.[MINDMAP_META.multiParent])) return targets;
    const childCount =
      typeof meta?.[MINDMAP_META.childCount] === "number"
        ? (meta?.[MINDMAP_META.childCount] as number)
        : 0;
    if (childCount <= 0) return targets;
    // 逻辑：文本节点悬停时也需要显示折叠按钮。
    const anchorId = resolveMindmapCollapseAnchor(
      element,
      snapshot,
      layoutDirection
    );
    const collapsed = Boolean(meta?.[MINDMAP_META.collapsed]);
    targets.set(element.id, { anchorId, collapsed });
  }
  return targets;
}

/** Resolve which anchor side should host the collapse toggle. */
function resolveMindmapCollapseAnchor(
  element: CanvasNodeElement,
  snapshot: CanvasSnapshot,
  layoutDirection: MindmapLayoutDirection
): "left" | "right" {
  const [x, y, w, h] = element.xywh;
  const centerX = x + w / 2;
  const outbound = snapshot.elements.filter(item => {
    if (item.kind !== "connector") return false;
    if (!("elementId" in item.source)) return false;
    return item.source.elementId === element.id;
  });
  let leftCount = 0;
  let rightCount = 0;
  outbound.forEach(connector => {
    if ("elementId" in connector.target) {
      const target = snapshot.elements.find(
        item => item.kind === "node" && item.id === connector.target.elementId
      );
      if (!target) return;
      const targetCenterX = target.xywh[0] + target.xywh[2] / 2;
      if (targetCenterX >= centerX) {
        rightCount += 1;
      } else {
        leftCount += 1;
      }
      return;
    }
    const targetX = connector.target.point[0];
    if (targetX >= centerX) {
      rightCount += 1;
    } else {
      leftCount += 1;
    }
  });
  if (leftCount === 0 && rightCount === 0) {
    return layoutDirection === "left" ? "left" : "right";
  }
  if (leftCount === rightCount) {
    return layoutDirection === "left" ? "left" : "right";
  }
  return rightCount >= leftCount ? "right" : "left";
}

/** Collect anchors for selected large-anchor nodes. */
function getSelectedImageAnchors(snapshot: CanvasSnapshot): CanvasAnchorHit[] {
  if (snapshot.selectedIds.length === 0) return [];
  const selectedAnchors: CanvasAnchorHit[] = [];
  snapshot.selectedIds.forEach(selectedId => {
    const element = snapshot.elements.find(item => item.id === selectedId);
    if (!element || element.kind !== "node") return;
    const meta = element.meta as Record<string, unknown> | undefined;
    if (typeof meta?.groupId === "string") return;
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

/** Collect anchors for hovered large-anchor nodes. */
function getHoveredImageAnchors(snapshot: CanvasSnapshot): CanvasAnchorHit[] {
  const hoverNodeId = snapshot.nodeHoverId;
  if (!hoverNodeId) return [];
  if (snapshot.selectedIds.includes(hoverNodeId)) return [];
  const element = snapshot.elements.find(item => item.id === hoverNodeId);
  const meta = element?.meta as Record<string, unknown> | undefined;
  if (
    !element ||
    element.kind !== "node" ||
    typeof meta?.groupId === "string" ||
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
