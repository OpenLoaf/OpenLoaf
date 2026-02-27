/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasElement } from "./types";

type CanvasHistoryState = {
  /** Snapshot of elements for history. */
  elements: CanvasElement[];
  /** Selected ids for history. */
  selectedIds: string[];
};

/** Clone elements to avoid mutation across history states. */
function cloneElements(elements: CanvasElement[]): CanvasElement[] {
  if (typeof structuredClone === "function") {
    return structuredClone(elements);
  }
  return JSON.parse(JSON.stringify(elements)) as CanvasElement[];
}

/** Compare two history snapshots for equality. */
function isHistoryStateEqual(a: CanvasHistoryState, b: CanvasHistoryState): boolean {
  if (a.selectedIds.length !== b.selectedIds.length) return false;
  for (let i = 0; i < a.selectedIds.length; i += 1) {
    const leftId = a.selectedIds[i];
    const rightId = b.selectedIds[i];
    if (leftId !== rightId) return false;
  }
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i += 1) {
    const left = a.elements[i];
    const right = b.elements[i];
    if (!left || !right) return false;
    if (left.id !== right.id || left.kind !== right.kind) return false;
    if (JSON.stringify(left) !== JSON.stringify(right)) return false;
  }
  return true;
}

export type { CanvasHistoryState };
export { cloneElements, isHistoryStateEqual };
