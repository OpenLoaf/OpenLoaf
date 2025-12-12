import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@teatime-ai/api/context";
import { appRouterDefine } from "@teatime-ai/api";
import { t } from "@teatime-ai/api";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { registerChatSse } from "./chat/sse";
import { workspaceRouterImplementation } from "./routers/workspace";
import { getTeatimeConfig } from "./config/index";

// Load config at startup to ensure it exists
console.log("Loading configuration...");
getTeatimeConfig();
console.log("Configuration loaded successfully");

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (
      process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001"
    )
      .split(",")
      .map((o) => o.trim()),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Dev-only: simulate slow network (300-600ms)
if (process.env.NODE_ENV !== "production") {
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

export default app;
