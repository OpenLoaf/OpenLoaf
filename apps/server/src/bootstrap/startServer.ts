import { createAdaptorServer } from "@hono/node-server";
import type { Server } from "node:http";
import { createApp } from "./createApp";
import { runtimeHub } from "@/modules/runtime/RuntimeHubAdapter";

/**
 * 启动 HTTP server（MVP）：
 * - 绑定 Hono fetch handler
 * - 挂载 runtime-ws（upgrade）
 */
export function startServer() {
  const app = createApp();

  const port = Number(process.env.PORT ?? 3000);
  const hostname = process.env.HOST ?? "127.0.0.1";

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname,
  });

  // 中文注释：createAdaptorServer 的类型包含 http2，这里只用 http upgrade 能力。
  runtimeHub.attachToServer(server as unknown as Server);

  server.listen(port, hostname, () => {
    const info = server.address();
    const actualPort =
      typeof info === "object" && info && "port" in info
        ? (info as any).port
        : port;
    console.log(`Server listening on http://${hostname}:${actualPort}`);
  });

  return { app, server };
}
