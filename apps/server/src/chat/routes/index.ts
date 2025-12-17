import type { Hono } from "hono";
import { registerChatSseCreateRoute } from "./sseCreate";
import { registerChatSseStreamRoute } from "./sseStream";

export const registerChatSse = (app: Hono) => {
  registerChatSseCreateRoute(app);
  registerChatSseStreamRoute(app);
};

