import type { CanvasElement, CanvasNodeElement } from "./CanvasTypes";

export class CanvasDoc {
  /** Element storage for the canvas document. */
  private readonly elements = new Map<string, CanvasElement>();
  /** Change emitter used to notify subscribers. */
  private readonly emitChange: () => void;
  /** Current transaction nesting depth. */
  private transactionDepth = 0;
  /** Pending change marker to coalesce updates. */
  private hasPendingChange = false;

  /** Create a new canvas document. */
  constructor(emitChange: () => void) {
    this.emitChange = emitChange;
  }

  /** Return all elements in insertion order. */
  getElements(): CanvasElement[] {
    return Array.from(this.elements.values());
  }

  /** Return a single element by id. */
  getElementById(id: string): CanvasElement | null {
    return this.elements.get(id) ?? null;
  }

  /** Add a new element to the document. */
  addElement(element: CanvasElement): void {
    this.elements.set(element.id, element);
    this.queueChange();
  }

  /** Replace the entire element list. */
  setElements(elements: CanvasElement[]): void {
    this.elements.clear();
    elements.forEach(element => {
      this.elements.set(element.id, element);
    });
    this.queueChange();
  }

  /** Update an existing element by id. */
  updateElement(id: string, patch: Partial<CanvasElement>): void {
    const current = this.elements.get(id);
    if (!current) return;

    // 仅合并 props 字段，避免节点属性被整体覆盖丢失。
    const next = { ...current, ...patch } as CanvasElement;
    if ("props" in current && "props" in patch && patch.props) {
      next.props = {
        ...(current as CanvasNodeElement).props,
        ...(patch.props as CanvasNodeElement["props"]),
      };
    }

    this.elements.set(id, next);
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
    if (!this.elements.has(id)) return;
    this.elements.delete(id);
    this.queueChange();
  }

  /** Delete multiple elements by id. */
  deleteElements(ids: string[]): void {
    let changed = false;
    ids.forEach(id => {
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
        this.emitChange();
      }
    }
  }

  /** Queue or emit a change notification. */
  private queueChange(): void {
    if (this.transactionDepth > 0) {
      this.hasPendingChange = true;
      return;
    }
    this.emitChange();
  }
}
