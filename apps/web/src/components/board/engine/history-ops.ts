import type { CanvasElement } from "./types";
import type { CanvasHistoryState } from "./history-utils";
import { cloneElements } from "./history-utils";

/** Build a history state from elements and selection ids. */
function buildHistoryState(elements: CanvasElement[], selectedIds: string[]): CanvasHistoryState {
  return {
    elements: cloneElements(elements),
    selectedIds: [...selectedIds],
  };
}

/** Filter selection ids to those that still exist. */
function filterSelectionIds(elements: CanvasElement[], selectedIds: string[]): string[] {
  const validIds = new Set(elements.map(element => element.id));
  return selectedIds.filter(id => validIds.has(id));
}

export { buildHistoryState, filterSelectionIds };
