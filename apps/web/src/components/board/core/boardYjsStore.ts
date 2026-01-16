import * as Y from "yjs";
import type { CanvasConnectorElement, CanvasNodeElement } from "../engine/types";

/** Storage key used for board payload inside the Yjs doc. */
const BOARD_DOC_KEY = "board";
/** Map key for node payloads inside the Yjs doc. */
const BOARD_DOC_NODES_KEY = "nodes";
/** Map key for connector payloads inside the Yjs doc. */
const BOARD_DOC_CONNECTORS_KEY = "connectors";
/** Byte length used for log entry length prefix. */
const LOG_ENTRY_LENGTH_BYTES = 4;

export type BoardDocPayload = {
  /** Persisted node elements. */
  nodes: CanvasNodeElement[];
  /** Persisted connector elements. */
  connectors: CanvasConnectorElement[];
};

/** Convert a Uint8Array into a base64 string. */
export function encodeBase64(data: Uint8Array): string {
  if (data.length === 0) return "";
  const BufferCtor = (globalThis as {
    Buffer?: { from: (...args: any[]) => { toString: (encoding: string) => string } };
  }).Buffer;
  if (BufferCtor) {
    return BufferCtor.from(data).toString("base64");
  }
  let binary = "";
  const chunkSize = 0x8000;
  // 逻辑：分片拼接，避免一次性转换导致内存峰值过高。
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Decode a base64 string into a Uint8Array. */
export function decodeBase64(value: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) return new Uint8Array(0);
  const BufferCtor = (globalThis as {
    Buffer?: { from: (...args: any[]) => Uint8Array };
  }).Buffer;
  if (BufferCtor) {
    return new Uint8Array(BufferCtor.from(trimmed, "base64"));
  }
  const binary = atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Create an empty board document. */
export function createBoardDoc(): Y.Doc {
  const doc = new Y.Doc();
  writeBoardDocPayload(doc, { nodes: [], connectors: [] });
  return doc;
}

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
export function writeBoardDocPayload(doc: Y.Doc, payload: BoardDocPayload): void {
  const safePayload = sanitizeBoardPayload(payload);
  doc.transact(() => {
    const map = doc.getMap<unknown>(BOARD_DOC_KEY);
    map.set(BOARD_DOC_NODES_KEY, safePayload.nodes);
    map.set(BOARD_DOC_CONNECTORS_KEY, safePayload.connectors);
  });
}

/** Encode the full document state into a Yjs update. */
export function encodeBoardDocUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/** Apply a Yjs update into the document. */
export function applyBoardDocUpdate(doc: Y.Doc, update: Uint8Array): void {
  if (update.length === 0) return;
  Y.applyUpdate(doc, update);
}

/** Encode a log entry by prefixing update length. */
export function encodeBoardLogEntry(update: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(LOG_ENTRY_LENGTH_BYTES + update.length);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, update.length);
  buffer.set(update, LOG_ENTRY_LENGTH_BYTES);
  return buffer;
}

/** Decode log entries from a concatenated log buffer. */
export function decodeBoardLogEntries(buffer: Uint8Array): Uint8Array[] {
  const updates: Uint8Array[] = [];
  let offset = 0;
  // 逻辑：日志按 [length][update] 顺序拼接，遇到不完整尾部直接丢弃。
  while (offset + LOG_ENTRY_LENGTH_BYTES <= buffer.length) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset);
    const length = view.getUint32(0);
    const start = offset + LOG_ENTRY_LENGTH_BYTES;
    const end = start + length;
    if (end > buffer.length) break;
    updates.push(buffer.subarray(start, end));
    offset = end;
  }
  return updates;
}

/** Create a base64 update for an empty board document. */
export function createEmptyBoardBase64(): string {
  const doc = createBoardDoc();
  return encodeBase64(encodeBoardDocUpdate(doc));
}

/** Convert payload to a JSON-safe structure. */
function sanitizeBoardPayload(payload: BoardDocPayload): BoardDocPayload {
  // 逻辑：移除 undefined 等非 JSON 字段，保证 Yjs 持久化稳定。
  return JSON.parse(JSON.stringify(payload)) as BoardDocPayload;
}
