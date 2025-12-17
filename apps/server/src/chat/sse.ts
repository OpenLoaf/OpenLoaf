import type { Hono } from "hono";
import { registerChatSse as registerChatSseInternal } from "./routes";

// AI SDK v6：流式对话接口（MVP）
export const registerChatSse = (app: Hono) => registerChatSseInternal(app);
