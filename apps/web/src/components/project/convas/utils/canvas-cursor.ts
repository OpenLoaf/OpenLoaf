import type { CanvasMode } from "../CanvasProvider";

/** Resolve cursor style for the current canvas mode. */
export function getCursorForMode(mode: CanvasMode) {
  switch (mode) {
    case "hand":
      return "grab";
    case "arrow-straight":
    case "arrow-curve":
    case "marked":
    case "frame":
    case "group":
      return "crosshair";
    default:
      return "default";
  }
}
