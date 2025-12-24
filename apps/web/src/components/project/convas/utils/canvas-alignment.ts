import type { Node as RFNode } from "reactflow";
import { resolveNodeSize } from "./node-size";

/** Compute best alignment guides and snap offsets for a dragging node. */
export function getAlignmentForNode(options: {
  dragId: string;
  dragPosition: { x: number; y: number };
  dragSize: { width: number; height: number };
  nodes: RFNode[];
  threshold: number;
}) {
  const { dragId, dragPosition, dragSize, nodes, threshold } = options;
  let bestX: { delta: number; guide: number; edges: [number, number]; sizeMatch: boolean } | null =
    null;
  let bestY: { delta: number; guide: number; edges: [number, number]; sizeMatch: boolean } | null =
    null;

  const dragAnchorsX = [
    { key: "left", value: dragPosition.x },
    { key: "center", value: dragPosition.x + dragSize.width / 2 },
    { key: "right", value: dragPosition.x + dragSize.width },
  ];
  const dragAnchorsY = [
    { key: "top", value: dragPosition.y },
    { key: "center", value: dragPosition.y + dragSize.height / 2 },
    { key: "bottom", value: dragPosition.y + dragSize.height },
  ];

  for (const node of nodes) {
    if (node.id === dragId || node.hidden) continue;
    const size = resolveNodeSize(node);
    if (!size) continue;
    const position =
      (node as RFNode & { positionAbsolute?: { x: number; y: number } }).positionAbsolute ??
      node.position;
    const targetLeft = position.x;
    const targetRight = position.x + size.width;
    const targetCenterX = position.x + size.width / 2;
    const targetTop = position.y;
    const targetBottom = position.y + size.height;
    const targetCenterY = position.y + size.height / 2;
    const targetAnchorsX = [
      { key: "left", value: targetLeft },
      { key: "center", value: targetCenterX },
      { key: "right", value: targetRight },
    ];
    const targetAnchorsY = [
      { key: "top", value: targetTop },
      { key: "center", value: targetCenterY },
      { key: "bottom", value: targetBottom },
    ];
    const widthMatch = Math.abs(dragSize.width - size.width) <= 1;
    const heightMatch = Math.abs(dragSize.height - size.height) <= 1;

    // 逻辑：遍历所有锚点组合，选择阈值内最近的对齐点
    for (const dragAnchor of dragAnchorsX) {
      for (const targetAnchor of targetAnchorsX) {
        const delta = targetAnchor.value - dragAnchor.value;
        const distance = Math.abs(delta);
        const sameAnchor = dragAnchor.key === targetAnchor.key;
        const sizeMatch = widthMatch && sameAnchor;
        if (
          distance <= threshold &&
          (!bestX ||
            distance < Math.abs(bestX.delta) ||
            (distance === Math.abs(bestX.delta) && sizeMatch && !bestX.sizeMatch))
        ) {
          bestX = {
            delta,
            guide: targetAnchor.value,
            edges: [targetLeft, targetRight],
            sizeMatch,
          };
        }
      }
    }

    for (const dragAnchor of dragAnchorsY) {
      for (const targetAnchor of targetAnchorsY) {
        const delta = targetAnchor.value - dragAnchor.value;
        const distance = Math.abs(delta);
        const sameAnchor = dragAnchor.key === targetAnchor.key;
        const sizeMatch = heightMatch && sameAnchor;
        if (
          distance <= threshold &&
          (!bestY ||
            distance < Math.abs(bestY.delta) ||
            (distance === Math.abs(bestY.delta) && sizeMatch && !bestY.sizeMatch))
        ) {
          bestY = {
            delta,
            guide: targetAnchor.value,
            edges: [targetTop, targetBottom],
            sizeMatch,
          };
        }
      }
    }
  }

  if (!bestX && !bestY) return null;
  return {
    guideX: bestX ? normalizeGuideValues(bestX.sizeMatch ? bestX.edges : [bestX.guide]) : [],
    guideY: bestY ? normalizeGuideValues(bestY.sizeMatch ? bestY.edges : [bestY.guide]) : [],
    snapX: bestX ? dragPosition.x + bestX.delta : undefined,
    snapY: bestY ? dragPosition.y + bestY.delta : undefined,
  };
}

/** Normalize guide positions for stable rendering. */
export function normalizeGuideValues(values: number[]): number[] {
  const unique: number[] = [];
  for (const value of values) {
    if (unique.some((existing) => Math.abs(existing - value) < 0.01)) continue;
    unique.push(value);
  }
  return unique.sort((a, b) => a - b);
}
