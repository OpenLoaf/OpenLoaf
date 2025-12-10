import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@teatime-ai/api/context";
import { appRouter } from "@teatime-ai/api";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { registerChatSse } from "./chat/sse";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: (process.env.CORS_ORIGIN ||
      "http://localhost:3000,http://localhost:3001")
      .split(",")
      .map((o) => o.trim()),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

registerChatSse(app);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
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
