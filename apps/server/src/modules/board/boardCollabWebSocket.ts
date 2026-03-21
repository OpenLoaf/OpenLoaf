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
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
import {
  buildBoardFolderUri,
  resolveBoardScopedRoot,
} from "@openloaf/api/common/boardPaths";
import { prisma } from "@openloaf/db";
import { logger } from "@/common/logger";

const BOARD_DOC_KEY = "board";
const BOARD_DOC_NODES_KEY = "nodes";
const BOARD_DOC_CONNECTORS_KEY = "connectors";
const BOARD_INDEX_FILE_NAME = "index.tnboard";
const BOARD_JSON_FILE_NAME = "index.tnboard.json";
const BOARD_STORE_INTERVAL_MS = 60 * 1000;
const BOARD_SYNC_SIGNAL = "flush";

type BoardCollabContext = {
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

/** Module-level Hocuspocus reference for shutdown flushing. */
let hocuspocusInstance: Hocuspocus | null = null;

/** Flush all in-memory board documents to disk before process exit. */
export async function flushBoardDocuments(): Promise<void> {
  if (!hocuspocusInstance) return;
  // 逻辑：遍历所有活跃文档，逐一强制刷盘，防止热重载/进程退出丢数据。
  const documents = (hocuspocusInstance as any).documents as Map<string, Y.Doc> | undefined;
  if (!documents || documents.size === 0) return;
  const tasks: Promise<void>[] = [];
  for (const [name, doc] of documents) {
    const boardDoc = doc as BoardDocument;
    if (!boardDoc.boardCollabContext) continue;
    tasks.push(
      storeBoardDocument(boardDoc).catch((error) => {
        logger.error({ err: error, docName: name }, "[board] flush document failed");
      }),
    );
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
    logger.info({ count: tasks.length }, "[board] flushed documents before shutdown");
  }
}

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

/** Parse a [x, y, w, h] tuple from an unknown value. */
function parseXywh(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const nums = value.slice(0, 4).map(Number);
  if (nums.some(Number.isNaN)) return undefined;
  return nums as [number, number, number, number];
}

/** Build the json snapshot including xywh positions. */
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
        xywh: parseXywh(node.xywh),
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
        xywh: parseXywh(connector.xywh),
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

/** Board folderUris for which we have already ensured a DB record in this process. */
const ensuredBoardFolderUris = new Set<string>();

/** Ensure a DB record exists for a board (create on first persist). */
async function ensureBoardDbRecord(ctx: BoardCollabContext): Promise<void> {
  const folderName = path.basename(ctx.boardFolderPath);
  if (!folderName) return;
  const rootPath = resolveBoardScopedRoot(ctx.projectId);
  const folderUri = buildBoardFolderUri(rootPath, folderName);
  if (ensuredBoardFolderUris.has(folderUri)) return;
  ensuredBoardFolderUris.add(folderUri);
  try {
    // Look up by folderUri — the DB id may differ from folder name for legacy boards
    const existing = await prisma.board.findFirst({ where: { folderUri } });
    if (existing) return;
    await prisma.board.create({
      data: {
        id: folderName,
        title: "画布",
        projectId: ctx.projectId ?? null,
        folderUri,
      },
    });
  } catch {
    // Ignore duplicate/constraint errors
  }
}

/** Read and parse a board JSON snapshot from disk. */
async function readBoardJsonSnapshot(filePath: string): Promise<BoardJsonSnapshot | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    if (!raw || !raw.trim()) return null;
    const parsed = JSON.parse(raw) as BoardJsonSnapshot;
    if (!Array.isArray(parsed.nodes) && !Array.isArray(parsed.connectors)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Default node size used when recovering from JSON without xywh. */
const RECOVER_W = 280;
const RECOVER_H = 180;
const RECOVER_GAP = 24;
const RECOVER_COLS = 4;

/** Recover board Yjs document from a JSON snapshot fallback. */
function recoverBoardFromJson(doc: Y.Doc, snapshot: BoardJsonSnapshot): void {
  const nodes: unknown[] = [];
  const connectors: unknown[] = [];
  let col = 0;
  let row = 0;
  for (const node of snapshot.nodes ?? []) {
    if (!node.id || !node.type) continue;
    const xywh = node.xywh ?? [
      col * (RECOVER_W + RECOVER_GAP),
      row * (RECOVER_H + RECOVER_GAP),
      RECOVER_W,
      RECOVER_H,
    ];
    nodes.push({
      id: node.id,
      type: node.type,
      kind: "node",
      xywh,
      props: node.props ?? {},
    });
    if (!node.xywh) {
      col++;
      if (col >= RECOVER_COLS) {
        col = 0;
        row++;
      }
    }
  }
  for (const connector of snapshot.connectors ?? []) {
    if (!connector.id) continue;
    connectors.push({
      id: connector.id,
      type: connector.type || "connector",
      kind: "connector",
      xywh: connector.xywh ?? [0, 0, 0, 0],
      source: connector.source ?? {},
      target: connector.target ?? {},
      style: connector.style,
    });
  }
  if (nodes.length === 0 && connectors.length === 0) return;
  doc.transact(() => {
    const map = doc.getMap<unknown>(BOARD_DOC_KEY);
    map.set(BOARD_DOC_NODES_KEY, nodes);
    map.set(BOARD_DOC_CONNECTORS_KEY, connectors);
  });
}

/** Persist the board document into snapshot and json files. */
async function storeBoardDocument(document: BoardDocument): Promise<void> {
  const boardContext = document.boardCollabContext;
  if (!boardContext) return;
  try {
    const update = Y.encodeStateAsUpdate(document);
    await writeBoardSnapshot(boardContext.boardFilePath, update);
  } catch (error) {
    logger.error({ err: error, path: boardContext.boardFilePath }, "[board] failed to write binary snapshot");
  }
  try {
    const payload = readBoardDocPayload(document);
    const jsonSnapshot = buildBoardJsonSnapshot(payload);
    await writeBoardJsonSnapshot(boardContext.boardJsonPath, jsonSnapshot);
  } catch (error) {
    logger.error({ err: error, path: boardContext.boardJsonPath }, "[board] failed to write json snapshot");
  }
  await ensureBoardDbRecord(boardContext);
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
      if (snapshot) {
        try {
          Y.applyUpdate(document, snapshot);
          return document;
        } catch (error) {
          logger.error(
            { err: error, path: boardContext.boardFilePath },
            "[board] corrupted binary snapshot, attempting JSON recovery",
          );
          // 将损坏的快照重命名为备份，防止下次再加载损坏数据
          try {
            const backupPath = `${boardContext.boardFilePath}.corrupted.${Date.now()}`;
            await rename(boardContext.boardFilePath, backupPath);
            logger.info({ backupPath }, "[board] corrupted snapshot backed up");
          } catch (renameError) {
            logger.warn({ err: renameError }, "[board] failed to backup corrupted snapshot");
          }
          // fall through 到下方 JSON 回退逻辑
        }
      }
      // 逻辑：二进制快照缺失时从 JSON 快照恢复，避免画布空白。
      const jsonSnapshot = await readBoardJsonSnapshot(boardContext.boardJsonPath);
      if (jsonSnapshot && ((jsonSnapshot.nodes?.length ?? 0) > 0 || (jsonSnapshot.connectors?.length ?? 0) > 0)) {
        logger.info(
          { path: boardContext.boardJsonPath, nodes: jsonSnapshot.nodes?.length, connectors: jsonSnapshot.connectors?.length },
          "[board] recovering from json snapshot (binary missing)",
        );
        recoverBoardFromJson(document, jsonSnapshot);
        // 逻辑：恢复后立即写入二进制快照，避免下次再走恢复。
        try {
          const update = Y.encodeStateAsUpdate(document);
          await writeBoardSnapshot(boardContext.boardFilePath, update);
        } catch (error) {
          logger.error({ err: error }, "[board] failed to persist recovered snapshot");
        }
        return document;
      }
      return null;
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
  hocuspocusInstance = hocuspocus;

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
