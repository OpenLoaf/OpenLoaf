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
};

export type { BoardSnapshotState };
export { BOARD_SCHEMA_VERSION };
