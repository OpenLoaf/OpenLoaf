"use client";

export type SnapLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type SnapBound = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type AlignCandidate = {
  delta: number;
  ref: SnapBound;
  refPos: number;
};

/** Build a snap bound from position and size data. */
export function buildSnapBound(
  position: { x: number; y: number },
  size: { width: number; height: number },
): SnapBound {
  const minX = position.x;
  const minY = position.y;
  const maxX = minX + size.width;
  const maxY = minY + size.height;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: size.width,
    height: size.height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/** Move a snap bound by a delta. */
export function moveSnapBound(bound: SnapBound, dx: number, dy: number): SnapBound {
  return {
    ...bound,
    minX: bound.minX + dx,
    maxX: bound.maxX + dx,
    minY: bound.minY + dy,
    maxY: bound.maxY + dy,
    centerX: bound.centerX + dx,
    centerY: bound.centerY + dy,
  };
}

/** Compute snap adjustments and guide lines for the moving bound. */
export function computeSnap(
  moving: SnapBound,
  references: SnapBound[],
  threshold: number,
): { dx: number; dy: number; lines: SnapLine[] } {
  const movingXs = [moving.minX, moving.centerX, moving.maxX];
  const movingYs = [moving.minY, moving.centerY, moving.maxY];
  let bestX: AlignCandidate | null = null;
  let bestY: AlignCandidate | null = null;

  for (const ref of references) {
    const refXs = [ref.minX, ref.centerX, ref.maxX];
    for (const refX of refXs) {
      for (const moveX of movingXs) {
        const delta = refX - moveX;
        const distance = Math.abs(delta);
        if (distance > threshold) continue;
        if (!bestX || distance < Math.abs(bestX.delta)) {
          bestX = { delta, ref, refPos: refX };
        }
      }
    }

    const refYs = [ref.minY, ref.centerY, ref.maxY];
    for (const refY of refYs) {
      for (const moveY of movingYs) {
        const delta = refY - moveY;
        const distance = Math.abs(delta);
        if (distance > threshold) continue;
        if (!bestY || distance < Math.abs(bestY.delta)) {
          bestY = { delta, ref, refPos: refY };
        }
      }
    }
  }

  const dx = bestX?.delta ?? 0;
  const dy = bestY?.delta ?? 0;
  const adjusted = moveSnapBound(moving, dx, dy);
  const lines: SnapLine[] = [];

  if (bestX) {
    lines.push({
      x1: bestX.refPos,
      y1: Math.min(adjusted.minY, bestX.ref.minY),
      x2: bestX.refPos,
      y2: Math.max(adjusted.maxY, bestX.ref.maxY),
    });
  }

  if (bestY) {
    lines.push({
      x1: Math.min(adjusted.minX, bestY.ref.minX),
      y1: bestY.refPos,
      x2: Math.max(adjusted.maxX, bestY.ref.maxX),
      y2: bestY.refPos,
    });
  }

  return { dx, dy, lines };
}
