/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ServerType } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import {
  BOARD_COLLAB_WS_PATH,
  boardCollabQuerySchema,
  type BoardCollabQuery,
  type BoardJsonSnapshot,
  resolveScopedPath,
} from "@openloaf/api";
import { logger } from "@/common/logger";

const BOARD_DOC_KEY = "board";
const BOARD_DOC_NODES_KEY = "nodes";
const BOARD_DOC_CONNECTORS_KEY = "connectors";
const BOARD_INDEX_FILE_NAME = "index.tnboard";
const BOARD_JSON_FILE_NAME = "index.tnboard.json";
const BOARD_STORE_INTERVAL_MS = 60 * 1000;
const BOARD_SYNC_SIGNAL = "flush";

type BoardCollabContext = {
  /** Workspace id used for file resolution. */
  workspaceId: string;
  /** Project id used for file resolution. */
  projectId?: string;
  /** Board file path on disk. */
  boardFilePath: string;
  /** Board json file path on disk. */
  boardJsonPath: string;
  /** Board folder path on disk. */
  boardFolderPath: string;
};

type BoardDocument = Y.Doc & { boardCollabContext?: BoardCollabContext };

/** Parse websocket upgrade URL. */
function parseUpgradeUrl(req: IncomingMessage): URL | null {
  const rawUrl = req.url;
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl, "http://localhost");
  } catch {
    return null;
  }
}

/** Parse and validate board collaboration query params. */
function parseBoardCollabQuery(params: URLSearchParams): BoardCollabQuery {
  const raw = Object.fromEntries(params.entries());
  const parsed = boardCollabQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid board collaboration query.");
  }
  return parsed.data;
}

/** Resolve a local file path from a file uri or absolute path. */
function resolveLocalPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) return fileURLToPath(trimmed);
  if (path.isAbsolute(trimmed)) return path.resolve(trimmed);
  return "";
}

/** Resolve a board-relative path and keep it inside the board folder. */
function resolveBoardRelativePath(basePath: string, value: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(resolvedBase, value);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    // 中文注释：禁止相对路径越界访问画布目录之外。
    throw new Error("Board-relative path escapes board folder.");
  }
  return resolvedTarget;
}

/** Resolve board storage paths from query params. */
function resolveBoardPaths(query: BoardCollabQuery): BoardCollabContext {
  const rawBoardFolder = query.boardFolderUri ?? "";
  const rawBoardFile = query.boardFileUri ?? "";
  let boardFolderPath = resolveLocalPath(rawBoardFolder);
  if (!boardFolderPath && rawBoardFolder) {
    boardFolderPath = resolveScopedPath({
      workspaceId: query.workspaceId,
      projectId: query.projectId,
      target: rawBoardFolder,
    });
  }
  let boardFilePath = resolveLocalPath(rawBoardFile);
  if (!boardFilePath && rawBoardFile && boardFolderPath) {
    boardFilePath = resolveBoardRelativePath(boardFolderPath, rawBoardFile);
  }
  if (!boardFilePath && rawBoardFile) {
    boardFilePath = resolveScopedPath({
      workspaceId: query.workspaceId,
      projectId: query.projectId,
      target: rawBoardFile,
    });
  }
  if (!boardFolderPath && boardFilePath) {
    boardFolderPath = path.dirname(boardFilePath);
  }
  if (!boardFilePath && boardFolderPath) {
    boardFilePath = path.join(boardFolderPath, BOARD_INDEX_FILE_NAME);
  }
  if (!boardFilePath) throw new Error("Board file path is required.");
  const boardJsonPath = path.join(boardFolderPath, BOARD_JSON_FILE_NAME);
  return {
    workspaceId: query.workspaceId,
    projectId: query.projectId,
    boardFilePath,
    boardFolderPath,
    boardJsonPath,
  };
}

/** Read a Yjs snapshot update from disk. */
async function readBoardSnapshot(filePath: string): Promise<Uint8Array | null> {
  try {
    const data = await readFile(filePath);
    if (!data || data.length === 0) return null;
    return new Uint8Array(data);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // 中文注释：缺少快照文件视为新画布。
      return null;
    }
    throw error;
  }
}

/** Write a Yjs snapshot update to disk. */
async function writeBoardSnapshot(filePath: string, update: Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, update);
}

/** Read board payload from a Yjs document. */
function readBoardDocPayload(doc: Y.Doc): { nodes: unknown[]; connectors: unknown[] } {
  const map = doc.getMap<unknown>(BOARD_DOC_KEY);
  const nodes = map.get(BOARD_DOC_NODES_KEY);
  const connectors = map.get(BOARD_DOC_CONNECTORS_KEY);
  return {
    nodes: Array.isArray(nodes) ? nodes : [],
    connectors: Array.isArray(connectors) ? connectors : [],
  };
}

/** Return true when the value is a record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Build the simplified json snapshot for debug. */
function buildBoardJsonSnapshot(payload: {
  nodes: unknown[];
  connectors: unknown[];
}): BoardJsonSnapshot {
  const nodes = payload.nodes
    .map((node) => {
      if (!isRecord(node)) return null;
      const id = typeof node.id === "string" ? node.id : "";
      const type = typeof node.type === "string" ? node.type : "";
      if (!id || !type) return null;
      return {
        id,
        kind: "node" as const,
        type,
        props: isRecord(node.props) ? node.props : undefined,
      };
    })
    .filter(Boolean) as BoardJsonSnapshot["nodes"];
  const connectors = payload.connectors
    .map((connector) => {
      if (!isRecord(connector)) return null;
      const id = typeof connector.id === "string" ? connector.id : "";
      const type = typeof connector.type === "string" ? connector.type : "";
      if (!id || !type) return null;
      return {
        id,
        kind: "connector" as const,
        type,
        source: isRecord(connector.source) ? connector.source : undefined,
        target: isRecord(connector.target) ? connector.target : undefined,
        style: typeof connector.style === "string" ? connector.style : undefined,
      };
    })
    .filter(Boolean) as BoardJsonSnapshot["connectors"];
  return { nodes, connectors };
}

/** Write board json snapshot to disk. */
async function writeBoardJsonSnapshot(filePath: string, payload: BoardJsonSnapshot): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

/** Persist the board document into snapshot and json files. */
async function storeBoardDocument(document: BoardDocument): Promise<void> {
  const boardContext = document.boardCollabContext;
  if (!boardContext) return;
  const update = Y.encodeStateAsUpdate(document);
  await writeBoardSnapshot(boardContext.boardFilePath, update);
  const payload = readBoardDocPayload(document);
  const jsonSnapshot = buildBoardJsonSnapshot(payload);
  await writeBoardJsonSnapshot(boardContext.boardJsonPath, jsonSnapshot);
}

/** Handle websocket upgrade requests for board collaboration. */
export function attachBoardCollabWebSocket(server: ServerType): void {
  const wss = new WebSocketServer({ noServer: true });
  const httpServer = server as HttpServer;
  const hocuspocus = new Hocuspocus({
    debounce: BOARD_STORE_INTERVAL_MS,
    maxDebounce: BOARD_STORE_INTERVAL_MS,
    unloadImmediately: true,
    quiet: true,
    onConnect: async ({ requestParameters, documentName }) => {
      const query = parseBoardCollabQuery(requestParameters);
      if (query.docId !== documentName) {
        throw new Error("Document id mismatch.");
      }
      return { boardCollab: resolveBoardPaths(query) };
    },
    onLoadDocument: async ({ context, document }) => {
      const boardContext = (context as { boardCollab?: BoardCollabContext }).boardCollab;
      if (!boardContext) {
        throw new Error("Board collaboration context missing.");
      }
      (document as BoardDocument).boardCollabContext = boardContext;
      const snapshot = await readBoardSnapshot(boardContext.boardFilePath);
      if (!snapshot) return null;
      // 逻辑：在当前文档上应用快照，保持上下文与持久化路径一致。
      Y.applyUpdate(document, snapshot);
      return document;
    },
    onStoreDocument: async ({ document }) => {
      await storeBoardDocument(document as BoardDocument);
    },
    onStateless: async ({ document, payload }) => {
      if (payload !== BOARD_SYNC_SIGNAL) return null;
      await storeBoardDocument(document as BoardDocument);
      return null;
    },
  });

  httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = parseUpgradeUrl(req);
    if (!url || url.pathname !== BOARD_COLLAB_WS_PATH) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, url);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    hocuspocus.handleConnection(ws, req);
    ws.on("error", (error: Error) => {
      logger.warn({ err: error }, "[board] collab websocket error");
    });
  });
}
