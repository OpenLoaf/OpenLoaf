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

export { isBoardUiTarget };
