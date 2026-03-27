/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
const BOARD_UI_SELECTORS = [
  "[data-canvas-toolbar]",
  "[data-board-controls]",
  "[data-node-toolbar]",
  "[data-node-inspector]",
  "[data-board-editor]",
] as const;

function isBoardUiTarget(
  target: EventTarget | null,
  extraSelectors: readonly string[] = []
): boolean {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!element) return false;
  const selectors = [...BOARD_UI_SELECTORS, ...extraSelectors];
  return selectors.some(selector => Boolean(element.closest(selector)));
}

/**
 * Check whether the pointer is geometrically over a board-UI element,
 * regardless of pointer-events CSS.  This catches the case where an AI panel
 * lives inside a pointer-events-none overlay: the event.target is the canvas,
 * but the cursor is visually on top of the panel.
 *
 * Uses a spatial + temporal cache: if the pointer hasn't moved more than
 * {@link BOARD_UI_HIT_MOVE_THRESHOLD} pixels and less than
 * {@link BOARD_UI_HIT_TTL_MS} ms have elapsed, the previous result is reused.
 * This avoids calling `document.elementsFromPoint` on every pointermove frame
 * (which triggers ScheduleStyleRecalculation in Chromium).
 */

/** Max pixel distance before re-checking elementsFromPoint. */
const BOARD_UI_HIT_MOVE_THRESHOLD = 4;
/** Max time (ms) before re-checking elementsFromPoint. */
const BOARD_UI_HIT_TTL_MS = 100;

let _boardUiHitX = 0;
let _boardUiHitY = 0;
let _boardUiHitResult = false;
let _boardUiHitTime = 0;

function isPointerOverBoardUi(event: PointerEvent): boolean {
  const now = performance.now();
  const dx = event.clientX - _boardUiHitX;
  const dy = event.clientY - _boardUiHitY;
  if (
    now - _boardUiHitTime < BOARD_UI_HIT_TTL_MS &&
    dx * dx + dy * dy < BOARD_UI_HIT_MOVE_THRESHOLD * BOARD_UI_HIT_MOVE_THRESHOLD
  ) {
    return _boardUiHitResult;
  }
  const elements = document.elementsFromPoint(event.clientX, event.clientY);
  const result = elements.some(el =>
    BOARD_UI_SELECTORS.some(sel => el.matches(sel) || el.closest(sel) !== null)
  );
  _boardUiHitX = event.clientX;
  _boardUiHitY = event.clientY;
  _boardUiHitResult = result;
  _boardUiHitTime = now;
  return result;
}

export { isBoardUiTarget, isPointerOverBoardUi };
