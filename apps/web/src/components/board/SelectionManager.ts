export class SelectionManager {
  /** Selected element ids in insertion order. */
  private selectedIds: string[] = [];
  /** Change emitter used to notify subscribers. */
  private readonly emitChange: () => void;

  /** Create a new selection manager. */
  constructor(emitChange: () => void) {
    this.emitChange = emitChange;
  }

  /** Replace selection with the provided ids. */
  setSelection(ids: string[]): void {
    this.selectedIds = [...new Set(ids)];
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
