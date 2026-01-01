import type { CanvasConnectorElement, CanvasNodeElement, CanvasPoint } from "../engine/types";

/** Current board snapshot schema version. */
const BOARD_SCHEMA_VERSION = 1;

type BoardSnapshotState = {
  /** Snapshot schema version. */
  schemaVersion: number;
  /** Persisted node elements. */
  nodes: CanvasNodeElement[];
  /** Persisted connector elements. */
  connectors: CanvasConnectorElement[];
  /** Persisted viewport state. */
  viewport: {
    /** Viewport zoom level. */
    zoom: number;
    /** Viewport offset in screen space. */
    offset: CanvasPoint;
  };
  /** Snapshot version. */
  version: number;
};

export type { BoardSnapshotState };
/** Create a default board snapshot payload. */
function createEmptyBoardSnapshot(): BoardSnapshotState {
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    nodes: [],
    connectors: [],
    viewport: {
      zoom: 1,
      offset: [0, 0],
    },
    version: Date.now(),
  };
}
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

export { BOARD_SCHEMA_VERSION, getWorkspaceIdFromCookie };
export { createEmptyBoardSnapshot };
