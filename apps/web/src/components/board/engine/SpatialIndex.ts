/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasNodeElement, CanvasRect } from "./types";

/** Simple grid-based spatial index for fast node lookups. */
export class SpatialIndex {
  /** Grid cell size in canvas units. */
  private readonly cellSize: number;
  /** Mapping from cell key to node ids in the cell. */
  private readonly cells = new Map<string, Set<string>>();
  /** Mapping from node id to occupied cell keys. */
  private readonly nodeCells = new Map<string, string[]>();
  /** Cached rect for each node. */
  private readonly rects = new Map<string, CanvasRect>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  /** Reset the index and rebuild from node list. */
  rebuild(nodes: CanvasNodeElement[]): void {
    this.cells.clear();
    this.nodeCells.clear();
    this.rects.clear();
    nodes.forEach(node => {
      const rect = this.toRect(node);
      this.insert(node.id, rect);
    });
  }

  /** Insert a node rect into the index. */
  insert(id: string, rect: CanvasRect): void {
    const keys = this.getCellKeys(rect);
    keys.forEach(key => {
      const bucket = this.cells.get(key);
      if (bucket) {
        bucket.add(id);
        return;
      }
      this.cells.set(key, new Set([id]));
    });
    this.nodeCells.set(id, keys);
    this.rects.set(id, rect);
  }

  /** Update an existing node rect. */
  update(id: string, rect: CanvasRect): void {
    const previous = this.rects.get(id);
    if (previous && this.isSameRect(previous, rect)) return;
    this.remove(id);
    this.insert(id, rect);
  }

  /** Remove a node from the index. */
  remove(id: string): void {
    const keys = this.nodeCells.get(id);
    if (keys) {
      keys.forEach(key => {
        const bucket = this.cells.get(key);
        if (!bucket) return;
        bucket.delete(id);
        if (bucket.size === 0) {
          this.cells.delete(key);
        }
      });
    }
    this.nodeCells.delete(id);
    this.rects.delete(id);
  }

  /** Query candidate node ids that intersect the rect's grid cells. */
  query(rect: CanvasRect): string[] {
    const keys = this.getCellKeys(rect);
    const result = new Set<string>();
    keys.forEach(key => {
      const bucket = this.cells.get(key);
      if (!bucket) return;
      bucket.forEach(id => result.add(id));
    });
    return Array.from(result);
  }

  /** Convert a node element to a rect. */
  private toRect(node: CanvasNodeElement): CanvasRect {
    const [x, y, w, h] = node.xywh;
    return { x, y, w, h };
  }

  /** Check whether two rects are identical. */
  private isSameRect(left: CanvasRect, right: CanvasRect): boolean {
    return (
      left.x === right.x &&
      left.y === right.y &&
      left.w === right.w &&
      left.h === right.h
    );
  }

  /** Compute cell keys overlapped by a rect. */
  private getCellKeys(rect: CanvasRect): string[] {
    // 逻辑：网格索引以整格覆盖范围计算，保证查询不会漏掉跨格节点。
    const minX = Math.floor(rect.x / this.cellSize);
    const minY = Math.floor(rect.y / this.cellSize);
    const maxX = Math.floor((rect.x + rect.w) / this.cellSize);
    const maxY = Math.floor((rect.y + rect.h) / this.cellSize);
    const keys: string[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        keys.push(`${x},${y}`);
      }
    }
    return keys;
  }
}
