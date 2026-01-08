import type {
  CanvasAnchorHit,
  CanvasConnectorDraft,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import { cn } from "@udecode/cn";
import { toScreenPoint } from "../utils/coordinates";

type AnchorOverlayProps = {
  /** Current snapshot for anchor rendering. */
  snapshot: CanvasSnapshot;
};

/** Render anchor handles above nodes for linking. */
export function AnchorOverlay({ snapshot }: AnchorOverlayProps) {
  const sourceAnchor = getDraftAnchor(snapshot.connectorDraft);
  const hoverAnchor = snapshot.connectorHover;
  if (!sourceAnchor && !hoverAnchor) return null;

  const anchors: CanvasAnchorHit[] = [];
  if (sourceAnchor) {
    // 逻辑：补齐草稿源锚点的坐标，用于正确定位圆点。
    const resolved = resolveAnchorHit(sourceAnchor, snapshot);
    if (resolved) anchors.push(resolved);
  }
  if (hoverAnchor) anchors.push(hoverAnchor);
  const uniqueAnchors = new Map<string, CanvasAnchorHit>();
  anchors.forEach(anchor => {
    const key = `${anchor.elementId}-${anchor.anchorId}`;
    if (!uniqueAnchors.has(key)) {
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
        const size = isHover ? 11 : 7;
        return (
          <div
            key={`${anchor.elementId}-${anchor.anchorId}`}
            className={cn(
              "absolute rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
              isHover
                ? "bg-[var(--canvas-connector-anchor-hover)]"
                : "bg-[var(--canvas-connector-anchor)]",
              "border-[var(--canvas-connector-handle-fill)]"
            )}
            style={{
              left: screen[0],
              top: screen[1],
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
            }}
          />
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
