import type { CanvasElement, CanvasPoint } from "../engine/types";

type BoardStorageState = {
  /** Storage schema version. */
  version: number;
  /** Persisted canvas elements. */
  elements: CanvasElement[];
  /** Persisted viewport state. */
  viewport: {
    /** Viewport zoom level. */
    zoom: number;
    /** Viewport offset in screen space. */
    offset: CanvasPoint;
  };
};

/** Read workspace id from document cookies. */
function getWorkspaceIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)workspace-id=([^;]+)/);
  if (!match) return null;
  const rawValue = match[1];
  if (!rawValue) return null;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export type { BoardStorageState };
export { getWorkspaceIdFromCookie };
