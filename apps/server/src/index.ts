import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@teatime-ai/api/context";
import { appRouterDefine } from "@teatime-ai/api";
import { t } from "@teatime-ai/api";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createAdaptorServer } from "@hono/node-server";
import { registerChatSse } from "./chat/sse";
import { workspaceRouterImplementation } from "./routers/workspace";
import { tabRouterImplementation } from "./routers/tab";
import { runtimeRouterImplementation } from "./routers/runtime";
import { getTeatimeConfig } from "./config/index";
import { browserRuntimeHub } from "./runtime/browserRuntimeHub";

// Load config at startup to ensure it exists
console.log("Loading configuration...");
getTeatimeConfig();
console.log("Configuration loaded successfully");

const app = new Hono();

const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

const corsOrigins =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ??
  defaultCorsOrigins;

const isDev = process.env.NODE_ENV !== "production";

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (corsOrigins.includes(origin)) return origin;

      if (isDev) {
        try {
          const url = new URL(origin);
          const isLocalhost =
            url.hostname === "localhost" || url.hostname === "127.0.0.1";
          if (url.protocol === "http:" && isLocalhost) return origin;
        } catch {
          return null;
        }
      }

      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

// Dev-only: simulate slow network (300-600ms)
if (isDev) {
  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    await new Promise((r) =>
      setTimeout(r, 300 + Math.floor(Math.random() * 301))
    );
    return next();
  });
}

registerChatSse(app);

app.use(
  "/trpc/*",
  trpcServer({
    router: t.router({
      ...appRouterDefine,
      // 替换为实现后的路由
      workspace: workspaceRouterImplementation,
      tab: tabRouterImplementation,
      runtime: runtimeRouterImplementation,
    }),
    createContext: (_opts, context) => {
      return createContext({ context });
    },
    onError: ({ error, path, input, type }) => {
      console.error(`tRPC Error: ${type} on ${path || "unknown path"}`, {
        error,
        input,
      });
    },
  })
);

app.get("/", (c) => {
  return c.text("OK");
});

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";

const server = createAdaptorServer({
  fetch: app.fetch,
  hostname,
});

// Browser Runtime Hub（WS）：用于 Electron/Headless runtime 连接与命令调度。
// createAdaptorServer 的返回类型是 ServerType（包含 http2），这里实际运行环境为 http server（支持 upgrade）。
browserRuntimeHub.attachToServer(server as unknown as import("node:http").Server);

server.listen(port, hostname, () => {
  const info = server.address();
  const actualPort =
    typeof info === "object" && info && "port" in info ? (info as any).port : port;
  console.log(`Server listening on http://${hostname}:${actualPort}`);
});

export default app;
