/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { createSecureServer } from "node:http2";
import { createServer as createTcpServer } from "node:net";
import { createAdaptorServer } from "@hono/node-server";
import { createApp } from "./createApp";
import { loadEmbeddedCerts } from "./ensureCerts";
import { logger } from "@/common/logger";
import { attachTerminalWebSocket } from "@/modules/terminal/terminalWebSocket";
import { attachBoardCollabWebSocket } from "@/modules/board/boardCollabWebSocket";
import { startEmailIdleManager } from "@/modules/email/emailIdleManager";
import { scheduleTimerRegistry } from "@/services/scheduleTimerRegistry";
import { scheduleOrchestrator } from "@/services/scheduleOrchestrator";

/**
 * 启动 HTTP/2（默认）或 HTTP/1.1（降级）server。
 *
 * HTTP/2 使用内嵌的 localhost 自签证书（见 ensureCerts.ts）。
 * 当 HTTP/2 启用时，同一端口同时接受两种连接：
 *   - TLS 连接 → HTTP/2 (HTTPS) — Electron 内部使用
 *   - 明文 HTTP → HTTP/1.1 fallback — OAuth 回调等外部浏览器场景
 * 设置 OPENLOAF_HTTP2=0 可强制降级到纯 HTTP/1.1。
 */
export function startServer() {
  const app = createApp();

  const port = Number(process.env.PORT ?? 23333);
  const hostname = process.env.HOST ?? "127.0.0.1";

  // ── HTTP/2 with TLS (default) ──
  const useH2 = process.env.OPENLOAF_HTTP2 !== "0";
  const certs = useH2 ? loadEmbeddedCerts() : null;

  // HTTPS/H2 server（Electron 内部连接，支持多路复用）
  const h2Server = useH2
    ? createAdaptorServer({
        fetch: app.fetch,
        hostname,
        createServer: createSecureServer as any,
        serverOptions: {
          key: certs!.key,
          cert: certs!.cert,
          allowHTTP1: true, // WebSocket upgrade 需要 HTTP/1.1 握手
        },
      })
    : null;

  // HTTP/1.1 server（降级模式 或 双协议模式下的明文 fallback）
  // OAuth 回调在外部浏览器打开，外部浏览器不信任自签名证书，必须走 HTTP。
  const httpServer = createAdaptorServer({ fetch: app.fetch, hostname });

  const primaryServer = h2Server ?? httpServer;
  attachTerminalWebSocket(primaryServer);
  attachBoardCollabWebSocket(primaryServer);

  if (useH2 && h2Server) {
    // 单端口双协议：TCP 层嗅探第一个字节判断 TLS vs 明文 HTTP。
    // TLS ClientHello 以 0x16 开头 → HTTPS/H2 server（Electron 连接）。
    // 明文 HTTP → HTTP/1.1 fallback（外部浏览器 OAuth 回调等）。
    const tcpServer = createTcpServer((socket) => {
      socket.on("error", () => socket.destroy());
      socket.once("readable", () => {
        const buf: Buffer | null = socket.read(1);
        if (!buf || buf.length === 0) { socket.destroy(); return; }
        socket.unshift(buf);

        if (buf[0] === 0x16) {
          h2Server.emit("connection", socket);
        } else {
          httpServer.emit("connection", socket);
        }
      });
    });
    tcpServer.on("error", (err) => logger.error(err, "TCP server error"));

    tcpServer.listen(port, hostname, () => {
      const info = tcpServer.address();
      const actualPort =
        typeof info === "object" && info && "port" in info ? info.port : port;
      logger.info(
        { hostname, port: actualPort, protocol: "h2 + http/1.1" },
        `Server listening on https://${hostname}:${actualPort} (also accepts plain HTTP)`,
      );
      logger.info({ hostname, port: actualPort }, "Server started successfully");
      void startEmailIdleManager();
      void scheduleTimerRegistry.start();
      scheduleOrchestrator.start();
    });
  } else {
    httpServer.listen(port, hostname, () => {
      const info = httpServer.address();
      const actualPort =
        typeof info === "object" && info && "port" in info
          ? (info as any).port
          : port;
      logger.info(
        { hostname, port: actualPort, protocol: "http/1.1" },
        `Server listening on http://${hostname}:${actualPort}`,
      );
      logger.info({ hostname, port: actualPort }, "Server started successfully");
      void startEmailIdleManager();
      void scheduleTimerRegistry.start();
      scheduleOrchestrator.start();
    });
  }

  return { app, server: primaryServer };
}
