import type { Hono } from "hono";
import { registerChatSseCreateRoute } from "./sse.route.create";
import { registerChatSseStreamRoute } from "./sse.route.stream";

/**
 * AI SDK v6：流式对话接口（SSE/数据流协议由 createAgentUIStreamResponse 负责）。
 *
 * 流程（MVP）：
 * 1) 根据 sessionId 从 DB 读取历史
 * 2) 把刚收到的新消息先写入 DB
 * 3) 将“完整历史（含新消息）”喂给 agent，进行流式生成
 */
export const registerChatSse = (app: Hono) => {
  registerChatSseCreateRoute(app);
  registerChatSseStreamRoute(app);
};
