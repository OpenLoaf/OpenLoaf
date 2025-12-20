import type { Hono } from "hono";
import { registerChatSseCreateRoute } from "./sseCreate";
import { registerChatSseStreamRoute } from "./sseStream";
import { registerChatSseStopRoute } from "./sseStop";

/** 注册 chat SSE 路由（MVP）。 */
export function registerChatSseRoutes(app: Hono) {
  registerChatSseCreateRoute(app);
  registerChatSseStreamRoute(app);
  registerChatSseStopRoute(app);
}

