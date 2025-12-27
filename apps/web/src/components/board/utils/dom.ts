const BOARD_UI_SELECTORS = [
  "[data-canvas-toolbar]",
  "[data-board-controls]",
  "[data-node-toolbar]",
  "[data-node-inspector]",
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
