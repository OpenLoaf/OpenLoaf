export class SelectionManager {
  /** Selected element ids in insertion order. */
  private selectedIds: string[] = [];
  /** Change emitter used to notify subscribers. */
  private readonly emitChange: () => void;

  /** Create a new selection manager. */
  constructor(emitChange: () => void) {
    this.emitChange = emitChange;
  }

  /** Normalize selection ids to a unique ordered list. */
  private normalizeSelection(ids: string[]): string[] {
    if (ids.length === 0) return [];
    const seen = new Set<string>();
    const next: string[] = [];
    ids.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id);
      next.push(id);
    });
    return next;
  }

  /** Check whether two selections are identical. */
  private isSameSelection(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /** Replace selection with the provided ids. */
  setSelection(ids: string[], options?: { emit?: boolean }): void {
    const next = this.normalizeSelection(ids);
    // 逻辑：选区未变化时跳过通知，避免重复渲染。
    if (this.isSameSelection(this.selectedIds, next)) return;
    this.selectedIds = next;
    if (options?.emit === false) return;
    this.emitChange();
  }

  /** Toggle selection state for an id. */
  toggle(id: string): void {
    const next = new Set(this.selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedIds = Array.from(next);
    this.emitChange();
  }

  /** Clear all selected ids. */
  clear(): void {
    if (this.selectedIds.length === 0) return;
    this.selectedIds = [];
    this.emitChange();
  }

  /** Return selected ids as an array. */
  getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  /** Check whether an id is selected. */
  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }
}
