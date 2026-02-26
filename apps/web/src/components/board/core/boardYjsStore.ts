/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport * as Y from "yjs";
import type { CanvasConnectorElement, CanvasNodeElement } from "../engine/types";

/** Storage key used for board payload inside the Yjs doc. */
const BOARD_DOC_KEY = "board";
/** Map key for node payloads inside the Yjs doc. */
const BOARD_DOC_NODES_KEY = "nodes";
/** Map key for connector payloads inside the Yjs doc. */
const BOARD_DOC_CONNECTORS_KEY = "connectors";

export type BoardDocPayload = {
  /** Persisted node elements. */
  nodes: CanvasNodeElement[];
  /** Persisted connector elements. */
  connectors: CanvasConnectorElement[];
};

/** Read a board payload from a Yjs doc. */
export function readBoardDocPayload(doc: Y.Doc): BoardDocPayload {
  const map = doc.getMap<unknown>(BOARD_DOC_KEY);
  const nodes = map.get(BOARD_DOC_NODES_KEY);
  const connectors = map.get(BOARD_DOC_CONNECTORS_KEY);
  return {
    nodes: Array.isArray(nodes) ? (nodes as CanvasNodeElement[]) : [],
    connectors: Array.isArray(connectors) ? (connectors as CanvasConnectorElement[]) : [],
  };
}

/** Write a board payload into a Yjs doc. */
export function writeBoardDocPayload(
  doc: Y.Doc,
  payload: BoardDocPayload,
  origin?: unknown
): void {
  const safePayload = sanitizeBoardPayload(payload);
  doc.transact(() => {
    const map = doc.getMap<unknown>(BOARD_DOC_KEY);
    map.set(BOARD_DOC_NODES_KEY, safePayload.nodes);
    map.set(BOARD_DOC_CONNECTORS_KEY, safePayload.connectors);
  }, origin);
}

/** Convert payload to a JSON-safe structure. */
function sanitizeBoardPayload(payload: BoardDocPayload): BoardDocPayload {
  // 逻辑：移除 undefined 等非 JSON 字段，保证 Yjs 持久化稳定。
  return JSON.parse(JSON.stringify(payload)) as BoardDocPayload;
}
