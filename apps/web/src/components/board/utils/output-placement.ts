/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type CanvasRect = [number, number, number, number];
export type StackPlacementDirection = "left" | "right" | "top" | "bottom";

export type RightStackPlacementOptions = {
  sideGap: number;
  stackGap: number;
  outputHeights: number[];
};

export type RightStackPlacement = {
  baseX: number;
  startY: number;
};

export type DirectionalStackPlacementOptions = {
  sideGap: number;
  stackGap: number;
  outputSize: [number, number];
  direction: StackPlacementDirection;
};

export type DirectionalStackPlacement = {
  x: number;
  y: number;
};

/** Pick the top-most output rect for alignment reference. */
function pickFirstOutput(outputs: CanvasRect[]): CanvasRect | null {
  return outputs.reduce<CanvasRect | null>((current, target) => {
    if (!current) return target;
    const [, currentY] = current;
    const [, targetY] = target;
    if (targetY < currentY) return target;
    if (targetY === currentY && target[0] < current[0]) return target;
    return current;
  }, null);
}

/** Pick the left-most output rect for alignment reference. */
function pickFirstHorizontalOutput(outputs: CanvasRect[]): CanvasRect | null {
  return outputs.reduce<CanvasRect | null>((current, target) => {
    if (!current) return target;
    const [currentX, currentY] = current;
    const [targetX, targetY] = target;
    if (targetX < currentX) return target;
    if (targetX === currentX && targetY < currentY) return target;
    return current;
  }, null);
}

/** Filter outputs that live on the requested side of the source node. */
function filterOutputsByDirection(
  sourceRect: CanvasRect,
  outputs: CanvasRect[],
  direction: StackPlacementDirection,
): CanvasRect[] {
  const [sourceX, sourceY, sourceW, sourceH] = sourceRect;
  const sourceCenterX = sourceX + sourceW / 2;
  const sourceCenterY = sourceY + sourceH / 2;
  return outputs.filter((target) => {
    const [targetX, targetY, targetW, targetH] = target;
    const targetCenterX = targetX + targetW / 2;
    const targetCenterY = targetY + targetH / 2;
    const deltaX = targetCenterX - sourceCenterX;
    const deltaY = targetCenterY - sourceCenterY;
    const dominantHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);
    switch (direction) {
      case "left":
        return dominantHorizontal && deltaX <= 0;
      case "right":
        return dominantHorizontal && deltaX >= 0;
      case "top":
        return !dominantHorizontal && deltaY <= 0;
      case "bottom":
        return !dominantHorizontal && deltaY >= 0;
      default:
        return false;
    }
  });
}

/** Resolve placement for outputs stacked to the right of a source node. */
export function resolveRightStackPlacement(
  sourceRect: CanvasRect,
  existingOutputs: CanvasRect[],
  options: RightStackPlacementOptions,
): RightStackPlacement | null {
  const heights = options.outputHeights.filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (heights.length === 0) return null;
  const [sourceX, sourceY, sourceW, sourceH] = sourceRect;

  if (existingOutputs.length > 0) {
    // 逻辑：找到最底部的下游节点（y + h 最大），新节点放在它正下方并 x 对齐。
    const bottommost = existingOutputs.reduce((best, cur) => {
      const bestBottom = best[1] + best[3];
      const curBottom = cur[1] + cur[3];
      return curBottom > bestBottom ? cur : best;
    });
    return {
      baseX: bottommost[0],
      startY: bottommost[1] + bottommost[3] + options.stackGap,
    };
  }

  // 无已有输出时：放在源节点右侧，垂直居中对齐。
  const totalHeight =
    heights.reduce((sum, value) => sum + value, 0) +
    options.stackGap * Math.max(heights.length - 1, 0);
  const centerY = sourceY + sourceH / 2;
  return {
    baseX: sourceX + sourceW + options.sideGap,
    startY: centerY - totalHeight / 2,
  };
}

/** Resolve placement for outputs stacked from a specific source anchor direction. */
export function resolveDirectionalStackPlacement(
  sourceRect: CanvasRect,
  existingOutputs: CanvasRect[],
  options: DirectionalStackPlacementOptions,
): DirectionalStackPlacement | null {
  const [width, height] = options.outputSize;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  const sameDirectionOutputs = filterOutputsByDirection(
    sourceRect,
    existingOutputs,
    options.direction,
  );
  const [sourceX, sourceY, sourceW, sourceH] = sourceRect;
  const sourceCenterX = sourceX + sourceW / 2;
  const sourceCenterY = sourceY + sourceH / 2;

  switch (options.direction) {
    case "left": {
      if (sameDirectionOutputs.length > 0) {
        // 逻辑：找到最底部的下游节点，新节点放在它正下方并右端对齐。
        const bottommost = sameDirectionOutputs.reduce((best, cur) => {
          const bestBottom = best[1] + best[3];
          const curBottom = cur[1] + cur[3];
          return curBottom > bestBottom ? cur : best;
        });
        return {
          x: bottommost[0] + bottommost[2] - width,
          y: bottommost[1] + bottommost[3] + options.stackGap,
        };
      }
      return {
        x: sourceX - options.sideGap - width,
        y: sourceCenterY - height / 2,
      };
    }
    case "right": {
      const placement = resolveRightStackPlacement(
        sourceRect,
        sameDirectionOutputs,
        {
          sideGap: options.sideGap,
          stackGap: options.stackGap,
          outputHeights: [height],
        },
      );
      return placement ? { x: placement.baseX, y: placement.startY } : null;
    }
    case "top": {
      const firstOutput = pickFirstHorizontalOutput(sameDirectionOutputs);
      const y = firstOutput
        ? firstOutput[1] + firstOutput[3] - height
        : sourceY - options.sideGap - height;
      const x =
        sameDirectionOutputs.length > 0
          ? sameDirectionOutputs.reduce(
              (maxX, target) => {
                const right = target[0] + target[2];
                // 逻辑：同侧已有节点时继续向右堆叠，保持顶部行对齐。
                return Math.max(maxX, right);
              },
              firstOutput ? firstOutput[0] + firstOutput[2] : sourceX,
            ) + options.stackGap
          : sourceCenterX - width / 2;
      return { x, y };
    }
    case "bottom": {
      const firstOutput = pickFirstHorizontalOutput(sameDirectionOutputs);
      const y = firstOutput
        ? firstOutput[1]
        : sourceY + sourceH + options.sideGap;
      const x =
        sameDirectionOutputs.length > 0
          ? sameDirectionOutputs.reduce(
              (maxX, target) => {
                const right = target[0] + target[2];
                // 逻辑：同侧已有节点时继续向右堆叠，保持底部行对齐。
                return Math.max(maxX, right);
              },
              firstOutput ? firstOutput[0] + firstOutput[2] : sourceX,
            ) + options.stackGap
          : sourceCenterX - width / 2;
      return { x, y };
    }
    default:
      return null;
  }
}
