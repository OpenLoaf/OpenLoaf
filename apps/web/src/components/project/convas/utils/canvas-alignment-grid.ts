import type { Node as RFNode } from "reactflow";
import { resolveNodeSize } from "./node-size";

type GridIndex = {
  queryRange: (range: { minX: number; minY: number; maxX: number; maxY: number }) => RFNode[];
};

/** Build a grid index for fast nearby node lookup. */
export function createAlignmentGridIndex(nodes: RFNode[], cellSize: number): GridIndex {
  const nodeMap = new Map<string, RFNode>();
  const grid = new Map<string, Set<string>>();

  const getCellKey = (col: number, row: number) => `${col},${row}`;
  const addToCell = (col: number, row: number, nodeId: string) => {
    const key = getCellKey(col, row);
    const bucket = grid.get(key) ?? new Set<string>();
    bucket.add(nodeId);
    grid.set(key, bucket);
  };

  for (const node of nodes) {
    if (node.hidden) continue;
    const size = resolveNodeSize(node);
    if (!size) continue;
    const position =
      (node as RFNode & { positionAbsolute?: { x: number; y: number } }).positionAbsolute ??
      node.position;
    const left = position.x;
    const top = position.y;
    const right = position.x + size.width;
    const bottom = position.y + size.height;
    const minCol = Math.floor(left / cellSize);
    const maxCol = Math.floor(right / cellSize);
    const minRow = Math.floor(top / cellSize);
    const maxRow = Math.floor(bottom / cellSize);
    nodeMap.set(node.id, node);
    // 逻辑：节点覆盖的所有网格都记录一次，便于范围查询
    for (let col = minCol; col <= maxCol; col += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        addToCell(col, row, node.id);
      }
    }
  }

  return {
    queryRange: (range) => {
      const minCol = Math.floor(range.minX / cellSize);
      const maxCol = Math.floor(range.maxX / cellSize);
      const minRow = Math.floor(range.minY / cellSize);
      const maxRow = Math.floor(range.maxY / cellSize);
      const ids = new Set<string>();
      // 逻辑：只扫描范围内网格，避免全量遍历
      for (let col = minCol; col <= maxCol; col += 1) {
        for (let row = minRow; row <= maxRow; row += 1) {
          const key = getCellKey(col, row);
          const bucket = grid.get(key);
          if (!bucket) continue;
          for (const id of bucket) {
            ids.add(id);
          }
        }
      }
      return Array.from(ids)
        .map((id) => nodeMap.get(id))
        .filter((node): node is RFNode => Boolean(node));
    },
  };
}
