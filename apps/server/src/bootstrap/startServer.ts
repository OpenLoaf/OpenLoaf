import { createAdaptorServer } from "@hono/node-server";
import { createApp } from "./createApp";
import { logger } from "@/common/logger";
import { attachTerminalWebSocket } from "@/modules/terminal/terminalWebSocket";

/**
 * 启动 HTTP server（MVP）：
 * - 绑定 Hono fetch handler
 */
export function startServer() {
  const app = createApp();

  const port = Number(process.env.PORT ?? 23333);
  const hostname = process.env.HOST ?? "127.0.0.1";

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname,
  });

  attachTerminalWebSocket(server);

  server.listen(port, hostname, () => {
    const info = server.address();
    const actualPort =
      typeof info === "object" && info && "port" in info
        ? (info as any).port
        : port;
    logger.info({ hostname, port: actualPort }, `Server listening on http://${hostname}:${actualPort}`);
    // 启动完成后输出统一成功日志，便于启动脚本/监控识别。
    logger.info({ hostname, port: actualPort }, "Server started successfully");
  });

  return { app, server };
}
