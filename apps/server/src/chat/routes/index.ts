import type { Hono } from "hono";
import { registerChatSseCreateRoute } from "./sseCreate";
import { registerChatSseStreamRoute } from "./sseStream";
import { registerChatSseStopRoute } from "./sseStop";

export const registerChatSse = (app: Hono) => {
  registerChatSseCreateRoute(app);
  registerChatSseStreamRoute(app);
  registerChatSseStopRoute(app);
};
