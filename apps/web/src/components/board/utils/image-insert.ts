import type { CanvasPoint } from "../engine/types";

/** Offset applied when inserting multiple images. */
export const IMAGE_NODE_STACK_OFFSET = 24;

/** Build a stacked image rect centered at a point. */
export function getStackedImageRect(
  center: CanvasPoint,
  size: [number, number],
  index: number,
  offset: number = IMAGE_NODE_STACK_OFFSET
): [number, number, number, number] {
  const [width, height] = size;
  const delta = offset * index;
  return [
    center[0] - width / 2 + delta,
    center[1] - height / 2 + delta,
    width,
    height,
  ];
}
