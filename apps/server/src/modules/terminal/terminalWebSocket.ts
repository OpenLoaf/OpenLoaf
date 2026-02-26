/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer } from "ws";
import type { RawData, WebSocket } from "ws";
import type { ServerType } from "@hono/node-server";
import { logger } from "@/common/logger";
import {
  getTerminalSession,
  isTerminalEnabled,
  touchTerminalSession,
} from "./terminalSessionManager";

type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code?: number; signal?: number };

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

/** Handle websocket upgrade requests for terminal sessions. */
export function attachTerminalWebSocket(server: ServerType): void {
  const wss = new WebSocketServer({ noServer: true });
  const httpServer = server as HttpServer;

  httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = parseUpgradeUrl(req);
    if (!url || url.pathname !== "/terminal/ws") return;
    if (!isTerminalEnabled()) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, url);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, url: URL) => {
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    const session = getTerminalSession(sessionId);
    if (!session || session.token !== token) {
      ws.close(1008, "Invalid session");
      return;
    }

    const send = (payload: TerminalServerMessage) => {
      if (ws.readyState !== 1) return;
      ws.send(JSON.stringify(payload));
    };

    touchTerminalSession(sessionId);
    const dataDisposable = session.pty.onData((data) => {
      touchTerminalSession(sessionId);
      send({ type: "output", data });
    });
    const exitDisposable = session.pty.onExit((event) => {
      send({ type: "exit", code: event.exitCode, signal: event.signal });
    });

    ws.on("message", (raw: RawData) => {
      const text = typeof raw === "string" ? raw : raw.toString();
      let payload: TerminalClientMessage | null = null;
      try {
        payload = JSON.parse(text) as TerminalClientMessage;
      } catch {
        return;
      }
      if (!payload) return;
      if (payload.type === "input" && typeof payload.data === "string") {
        // 中文注释：用户输入直接写入 PTY。
        session.pty.write(payload.data);
        touchTerminalSession(sessionId);
        return;
      }
      if (payload.type === "resize") {
        const cols = Number(payload.cols);
        const rows = Number(payload.rows);
        if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
        // 中文注释：仅在有效尺寸下触发 resize，避免异常值导致 PTY 报错。
        session.pty.resize(cols, rows);
        touchTerminalSession(sessionId);
      }
    });

    ws.on("close", () => {
      dataDisposable.dispose();
      exitDisposable.dispose();
    });
    ws.on("error", (error: Error) => {
      logger.warn({ err: error, sessionId }, "[terminal] websocket error");
    });
  });
}
