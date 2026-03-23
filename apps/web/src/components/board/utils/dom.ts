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
 */
function isPointerOverBoardUi(event: PointerEvent): boolean {
  const elements = document.elementsFromPoint(event.clientX, event.clientY);
  return elements.some(el =>
    BOARD_UI_SELECTORS.some(sel => el.matches(sel) || el.closest(sel) !== null)
  );
}

export { isBoardUiTarget, isPointerOverBoardUi };
