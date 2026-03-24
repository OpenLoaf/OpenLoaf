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

/**
 * Deep clone that preserves primitive references.
 * JS strings/numbers/booleans are immutable, so sharing them across history
 * snapshots is safe and avoids duplicating large data URL strings (~MB each).
 */
function deepCloneValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (Array.isArray(value)) {
    const len = value.length;
    const result = new Array(len);
    for (let i = 0; i < len; i += 1) {
      result[i] = deepCloneValue(value[i]);
    }
    return result;
  }
  if (t === "object") {
    const src = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const keys = Object.keys(src);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i]!;
      result[k] = deepCloneValue(src[k]);
    }
    return result;
  }
  return value;
}

/** Clone elements to avoid mutation across history states. */
function cloneElements(elements: CanvasElement[]): CanvasElement[] {
  return deepCloneValue(elements) as CanvasElement[];
}

/** Recursive deep equality check that avoids JSON.stringify overhead. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  const ta = typeof a;
  if (ta !== typeof b) return false;
  if (ta !== "object") return false;
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i += 1) {
      if (!deepEqual(aa[i], bb[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    const k = aKeys[i]!;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/** Compare two history snapshots for equality. */
function isHistoryStateEqual(a: CanvasHistoryState, b: CanvasHistoryState): boolean {
  if (a.selectedIds.length !== b.selectedIds.length) return false;
  for (let i = 0; i < a.selectedIds.length; i += 1) {
    if (a.selectedIds[i] !== b.selectedIds[i]) return false;
  }
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i += 1) {
    const left = a.elements[i];
    const right = b.elements[i];
    if (!left || !right) return false;
    if (left.id !== right.id || left.kind !== right.kind) return false;
    if (!deepEqual(left, right)) return false;
  }
  return true;
}

export type { CanvasHistoryState };
export { cloneElements, isHistoryStateEqual };
