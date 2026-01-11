import type {
  CanvasAnchorHit,
  CanvasConnectorDraft,
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
  const sourceAnchor = getDraftAnchor(snapshot.connectorDraft);
  const hoverAnchor = snapshot.connectorHover;
  const selectedAnchors = getSelectedImageAnchors(snapshot);
  const hoverAnchors = getHoveredImageAnchors(snapshot);
  if (
    !sourceAnchor &&
    !hoverAnchor &&
    selectedAnchors.length === 0 &&
    hoverAnchors.length === 0
  ) {
    return null;
  }

  const anchors: AnchorOverlayItem[] = [];
  selectedAnchors.forEach(anchor => {
    anchors.push({ ...anchor, origin: "selected" });
  });
  hoverAnchors.forEach(anchor => {
    anchors.push({ ...anchor, origin: "hover" });
  });
  if (sourceAnchor) {
    // 逻辑：补齐草稿源锚点的坐标，用于正确定位圆点。
    const resolved = resolveAnchorHit(sourceAnchor, snapshot);
    if (
      resolved &&
      !isSelectedImageAnchor(resolved.elementId, snapshot) &&
      !isHoverImageAnchor(resolved.elementId, snapshot)
    ) {
      anchors.push({ ...resolved, origin: "connector" });
    }
  }
  if (
    hoverAnchor &&
    !isSelectedImageAnchor(hoverAnchor.elementId, snapshot) &&
    !isHoverImageAnchor(hoverAnchor.elementId, snapshot)
  ) {
    anchors.push({ ...hoverAnchor, origin: "connector" });
  }
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
        const screen = toScreenPoint(anchor.point, snapshot);
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

/** Extract draft source anchor for overlay rendering. */
function getDraftAnchor(draft: CanvasConnectorDraft | null): CanvasAnchorHit | null {
  if (!draft) return null;
  if ("elementId" in draft.source && draft.source.anchorId) {
    return {
      elementId: draft.source.elementId,
      anchorId: draft.source.anchorId,
      point: [0, 0],
    };
  }
  return null;
}

/** Resolve anchor hit with the latest anchor coordinates. */
function resolveAnchorHit(
  anchor: CanvasAnchorHit,
  snapshot: CanvasSnapshot
): CanvasAnchorHit | null {
  const list = snapshot.anchors[anchor.elementId];
  if (!list) return null;
  const match = list.find(item => item.id === anchor.anchorId);
  if (!match) return null;
  return { ...anchor, point: match.point as CanvasPoint };
}

/** Check whether the anchor belongs to a selected image node. */
function isSelectedImageAnchor(elementId: string, snapshot: CanvasSnapshot): boolean {
  if (!snapshot.selectedIds.includes(elementId)) return false;
  const element = snapshot.elements.find(item => item.id === elementId);
  return element?.kind === "node" && element.type === "image";
}

/** Check whether the anchor belongs to a hovered image node. */
function isHoverImageAnchor(elementId: string, snapshot: CanvasSnapshot): boolean {
  const hoverNodeId = snapshot.nodeHoverId;
  if (!hoverNodeId || hoverNodeId !== elementId) return false;
  if (snapshot.selectedIds.includes(elementId)) return false;
  const element = snapshot.elements.find(item => item.id === elementId);
  return element?.kind === "node" && element.type === "image";
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

/** Collect anchors for selected image nodes. */
function getSelectedImageAnchors(snapshot: CanvasSnapshot): CanvasAnchorHit[] {
  if (snapshot.selectedIds.length === 0) return [];
  const selectedAnchors: CanvasAnchorHit[] = [];
  snapshot.selectedIds.forEach(selectedId => {
    const element = snapshot.elements.find(item => item.id === selectedId);
    if (!element || element.kind !== "node") return;
    if (element.type !== "image") return;
    const anchors = snapshot.anchors[selectedId];
    if (!anchors) return;
    anchors.forEach(anchor => {
      // 逻辑：图片节点选中时仅保留左右锚点。
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

/** Collect anchors for hovered image nodes. */
function getHoveredImageAnchors(snapshot: CanvasSnapshot): CanvasAnchorHit[] {
  const hoverNodeId = snapshot.nodeHoverId;
  if (!hoverNodeId) return [];
  if (snapshot.selectedIds.includes(hoverNodeId)) return [];
  const element = snapshot.elements.find(item => item.id === hoverNodeId);
  if (!element || element.kind !== "node" || element.type !== "image") return [];
  const anchors = snapshot.anchors[hoverNodeId];
  if (!anchors) return [];
  const hoveredAnchors: CanvasAnchorHit[] = [];
  anchors.forEach(anchor => {
    // 逻辑：图片节点悬停时仅展示左右锚点。
    if (anchor.id !== "left" && anchor.id !== "right") return;
    hoveredAnchors.push({
      elementId: hoverNodeId,
      anchorId: anchor.id,
      point: anchor.point as CanvasPoint,
    });
  });
  return hoveredAnchors;
}
