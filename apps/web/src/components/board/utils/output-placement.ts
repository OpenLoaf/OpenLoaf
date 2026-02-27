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

export type RightStackPlacementOptions = {
  sideGap: number;
  stackGap: number;
  outputHeights: number[];
};

export type RightStackPlacement = {
  baseX: number;
  startY: number;
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

/** Resolve placement for outputs stacked to the right of a source node. */
export function resolveRightStackPlacement(
  sourceRect: CanvasRect,
  existingOutputs: CanvasRect[],
  options: RightStackPlacementOptions
): RightStackPlacement | null {
  const heights = options.outputHeights.filter(
    (value) => Number.isFinite(value) && value > 0
  );
  if (heights.length === 0) return null;
  const [sourceX, sourceY, sourceW, sourceH] = sourceRect;
  const firstOutput = pickFirstOutput(existingOutputs);
  const baseX = firstOutput ? firstOutput[0] : sourceX + sourceW + options.sideGap;
  const startY =
    existingOutputs.length > 0
      ? existingOutputs.reduce((maxY, target) => {
          const bottom = target[1] + target[3];
          // 逻辑：已有输出时从最底部继续往下摆放。
          return Math.max(maxY, bottom);
        }, firstOutput ? firstOutput[1] + firstOutput[3] : sourceY) +
        options.stackGap
      : (() => {
          const totalHeight =
            heights.reduce((sum, value) => sum + value, 0) +
            options.stackGap * Math.max(heights.length - 1, 0);
          const centerY = sourceY + sourceH / 2;
          // 逻辑：新生成的输出栈以源节点中心对齐。
          return centerY - totalHeight / 2;
        })();
  return { baseX, startY };
}
