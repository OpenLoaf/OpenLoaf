/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { CanvasElement, CanvasNodeElement, CanvasRect } from "./types";
import { SpatialIndex } from "./SpatialIndex";

const NODE_SPATIAL_INDEX_CELL_SIZE = 500;

export class CanvasDoc {
  /** Element storage for the canvas document. */
  private readonly elements = new Map<string, CanvasElement>();
  /** Change emitter used to notify subscribers. */
  private readonly emitChange: () => void;
  /** Current transaction nesting depth. */
  private transactionDepth = 0;
  /** Pending change marker to coalesce updates. */
  private hasPendingChange = false;
  /** Current document revision. */
  private revision = 0;
  /** Pending revision marker for batched updates. */
  private hasPendingRevision = false;
  /** Spatial index for node hit queries. */
  private readonly nodeSpatialIndex = new SpatialIndex(NODE_SPATIAL_INDEX_CELL_SIZE);

  /** Create a new canvas document. */
  constructor(emitChange: () => void) {
    this.emitChange = emitChange;
  }

  /** Return all elements in insertion order. */
  getElements(): CanvasElement[] {
    return Array.from(this.elements.values());
  }

  /** Query candidate nodes by rectangle using the spatial index. */
  getNodeCandidatesInRect(rect: CanvasRect): CanvasNodeElement[] {
    const candidateIds = this.nodeSpatialIndex.query(rect);
    const result: CanvasNodeElement[] = [];
    candidateIds.forEach(id => {
      const element = this.elements.get(id);
      if (element && element.kind === "node") {
        result.push(element);
      }
    });
    return result;
  }

  /** Return the current document revision. */
  getRevision(): number {
    return this.revision;
  }

  /** Return a single element by id. */
  getElementById(id: string): CanvasElement | null {
    return this.elements.get(id) ?? null;
  }

  /** Add a new element to the document. */
  addElement(element: CanvasElement): void {
    this.elements.set(element.id, element);
    if (element.kind === "node") {
      const [x, y, w, h] = element.xywh;
      this.nodeSpatialIndex.insert(element.id, { x, y, w, h });
    }
    this.queueChange();
  }

  /** Replace the entire element list. */
  setElements(elements: CanvasElement[]): void {
    this.elements.clear();
    elements.forEach(element => {
      this.elements.set(element.id, element);
    });
    const nodes = elements.filter(
      (element): element is CanvasNodeElement => element.kind === "node"
    );
    this.nodeSpatialIndex.rebuild(nodes);
    this.queueChange();
  }

  /** Update an existing element by id. */
  updateElement(id: string, patch: Partial<CanvasElement>): void {
    const current = this.elements.get(id);
    if (!current) return;

    // 仅合并 props 字段，避免节点属性被整体覆盖丢失。
    let next: CanvasElement;
    if (current.kind === "node" && "props" in patch && patch.props) {
      next = {
        ...current,
        ...patch,
        props: {
          ...(current as CanvasNodeElement).props,
          ...(patch.props as CanvasNodeElement["props"]),
        },
      };
    } else {
      next = { ...current, ...patch } as CanvasElement;
    }

    this.elements.set(id, next);
    if (next.kind === "node") {
      const [x, y, w, h] = next.xywh;
      this.nodeSpatialIndex.update(id, { x, y, w, h });
    }
    this.queueChange();
  }

  /** Update node props for a node element. */
  updateNodeProps<P extends Record<string, unknown>>(
    id: string,
    patch: Partial<P>
  ): void {
    const current = this.elements.get(id);
    if (!current || current.kind !== "node") return;

    // 专门处理节点 props 更新，避免误更新其他元素类型。
    this.updateElement(id, { props: patch } as Partial<CanvasElement>);
  }

  /** Delete an element by id. */
  deleteElement(id: string): void {
    const element = this.elements.get(id);
    if (!element) return;
    if (element.kind === "node") {
      this.nodeSpatialIndex.remove(id);
    }
    this.elements.delete(id);
    this.queueChange();
  }

  /** Delete multiple elements by id. */
  deleteElements(ids: string[]): void {
    let changed = false;
    ids.forEach(id => {
      const element = this.elements.get(id);
      if (!element) return;
      if (element.kind === "node") {
        this.nodeSpatialIndex.remove(id);
      }
      if (this.elements.delete(id)) {
        changed = true;
      }
    });
    if (changed) {
      this.queueChange();
    }
  }

  /** Run a batch of changes in a single transaction. */
  transact(fn: () => void): void {
    // 使用嵌套计数器合并变更，确保批量操作只触发一次通知。
    this.transactionDepth += 1;
    try {
      fn();
    } finally {
      this.transactionDepth -= 1;
      if (this.transactionDepth === 0 && this.hasPendingChange) {
        this.hasPendingChange = false;
        if (this.hasPendingRevision) {
          this.revision += 1;
          this.hasPendingRevision = false;
        }
        this.emitChange();
      }
    }
  }

  /** Queue or emit a change notification. */
  private queueChange(): void {
    if (this.transactionDepth > 0) {
      this.hasPendingChange = true;
      this.hasPendingRevision = true;
      return;
    }
    this.revision += 1;
    this.emitChange();
  }
}
