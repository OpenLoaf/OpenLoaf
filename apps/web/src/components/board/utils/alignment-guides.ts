import type { CanvasAlignmentGuide, CanvasRect } from "../engine/types";

type Axis = "x" | "y";
type AnchorKind = "start" | "center" | "end";

export type CanvasSnapResult = {
  /** Next rect after snapping. */
  rect: CanvasRect;
  /** Alignment guides to render. */
  guides: CanvasAlignmentGuide[];
};

type SnapCandidate = {
  /** Axis for the snap candidate. */
  axis: Axis;
  /** Offset delta to apply. */
  diff: number;
  /** Target axis value for alignment. */
  target: number;
  /** Other rect used for alignment. */
  other: CanvasRect;
};

/** Compute snapping for a moving rect. */
export function snapMoveRect(
  moving: CanvasRect,
  others: CanvasRect[],
  threshold: number,
  margin: number
): CanvasSnapResult {
  // 逻辑：优先找出最接近的同类对齐线，再应用吸附。
  const snapX = findMoveCandidate(moving, others, "x", threshold);
  const snapY = findMoveCandidate(moving, others, "y", threshold);

  const next: CanvasRect = { ...moving };
  if (snapX) next.x += snapX.diff;
  if (snapY) next.y += snapY.diff;

  const guides: CanvasAlignmentGuide[] = [];
  if (snapX) {
    guides.push(buildGuide("x", snapX.target, next, snapX.other, margin));
  }
  if (snapY) {
    guides.push(buildGuide("y", snapY.target, next, snapY.other, margin));
  }

  return { rect: next, guides };
}

/** Compute snapping for a resize from the bottom-right handle. */
export function snapResizeRectSE(
  moving: CanvasRect,
  others: CanvasRect[],
  threshold: number,
  margin: number,
  minSize: { w: number; h: number }
): CanvasSnapResult {
  // 逻辑：仅处理右下角边界的吸附，避免影响固定边。
  const snapX = findResizeCandidate(moving, others, "x", threshold, minSize);
  const snapY = findResizeCandidate(moving, others, "y", threshold, minSize);

  const next: CanvasRect = { ...moving };
  if (snapX) next.w = Math.max(minSize.w, next.w + snapX.diff);
  if (snapY) next.h = Math.max(minSize.h, next.h + snapY.diff);

  const guides: CanvasAlignmentGuide[] = [];
  if (snapX) {
    guides.push(buildGuide("x", snapX.target, next, snapX.other, margin));
  }
  if (snapY) {
    guides.push(buildGuide("y", snapY.target, next, snapY.other, margin));
  }

  return { rect: next, guides };
}

/** Find the closest move snap candidate for an axis. */
function findMoveCandidate(
  moving: CanvasRect,
  others: CanvasRect[],
  axis: Axis,
  threshold: number
): SnapCandidate | null {
  const candidates: SnapCandidate[] = [];
  const kinds: AnchorKind[] = ["start", "center", "end"];

  kinds.forEach(kind => {
    const movingValue = getAnchorValue(moving, axis, kind);
    others.forEach(other => {
      const target = getAnchorValue(other, axis, kind);
      const diff = target - movingValue;
      if (Math.abs(diff) <= threshold) {
        candidates.push({
          axis,
          diff,
          target,
          other,
        });
      }
    });
  });

  return pickClosest(candidates);
}

/** Find the closest resize snap candidate for an axis. */
function findResizeCandidate(
  moving: CanvasRect,
  others: CanvasRect[],
  axis: Axis,
  threshold: number,
  minSize: { w: number; h: number }
): SnapCandidate | null {
  const candidates: SnapCandidate[] = [];
  const kinds: AnchorKind[] = ["start", "center", "end"];
  const movingEdge = getResizeEdge(moving, axis);

  kinds.forEach(kind => {
    others.forEach(other => {
      const target = getAnchorValue(other, axis, kind);
      const diff = target - movingEdge;
      if (Math.abs(diff) > threshold) return;
      // 逻辑：吸附不允许突破最小尺寸。
      if (axis === "x" && moving.w + diff < minSize.w) return;
      if (axis === "y" && moving.h + diff < minSize.h) return;
      candidates.push({
        axis,
        diff,
        target,
        other,
      });
    });
  });

  return pickClosest(candidates);
}

/** Pick the closest candidate by smallest absolute diff. */
function pickClosest(candidates: SnapCandidate[]): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  candidates.forEach(candidate => {
    const distance = Math.abs(candidate.diff);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}

/** Build an alignment guide line for an axis. */
function buildGuide(
  axis: Axis,
  value: number,
  moving: CanvasRect,
  other: CanvasRect,
  margin: number
): CanvasAlignmentGuide {
  if (axis === "x") {
    const start = Math.min(moving.y, other.y) - margin;
    const end = Math.max(moving.y + moving.h, other.y + other.h) + margin;
    return { axis, value, start, end };
  }
  const start = Math.min(moving.x, other.x) - margin;
  const end = Math.max(moving.x + moving.w, other.x + other.w) + margin;
  return { axis, value, start, end };
}

/** Resolve the anchor value for a rect on the given axis and kind. */
function getAnchorValue(rect: CanvasRect, axis: Axis, kind: AnchorKind): number {
  if (axis === "x") {
    if (kind === "start") return rect.x;
    if (kind === "center") return rect.x + rect.w / 2;
    return rect.x + rect.w;
  }
  if (kind === "start") return rect.y;
  if (kind === "center") return rect.y + rect.h / 2;
  return rect.y + rect.h;
}

/** Resolve the anchor value and offset for a moving rect. */
/** Resolve the moving edge for resize snapping. */
function getResizeEdge(rect: CanvasRect, axis: Axis): number {
  return axis === "x" ? rect.x + rect.w : rect.y + rect.h;
}
