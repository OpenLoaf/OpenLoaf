import type {
  CanvasAnchorHit,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import { cn } from "@udecode/cn";
import { Plus } from "lucide-react";
import {
  SELECTED_ANCHOR_EDGE_SIZE,
  SELECTED_ANCHOR_EDGE_SIZE_HOVER,
  SELECTED_ANCHOR_GAP,
  SELECTED_ANCHOR_SIDE_SIZE,
  SELECTED_ANCHOR_SIDE_SIZE_HOVER,
} from "../engine/constants";
import { toScreenPoint } from "../utils/coordinates";
import { LARGE_ANCHOR_NODE_TYPES } from "../engine/anchorTypes";
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
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
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

  return (
    <div
      data-board-anchor-overlay
      className="pointer-events-none absolute inset-0 z-20"
    >
      {Array.from(uniqueAnchors.values()).map(anchor => {
        const screen = toScreenPoint(anchor.point, viewState);
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
        return (
          <div
            key={`${anchor.elementId}-${anchor.anchorId}`}
            className={cn(
              "absolute flex items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
              isHover
                ? "bg-[var(--canvas-connector-anchor-hover)]"
                : "bg-[var(--canvas-connector-anchor)]",
              "border-[var(--canvas-connector-handle-fill)]"
            )}
            style={{
              left: screen[0] + offset[0],
              top: screen[1] + offset[1],
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
