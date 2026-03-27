/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
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
