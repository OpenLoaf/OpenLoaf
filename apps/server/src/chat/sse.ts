import { deepseek } from "@ai-sdk/deepseek";
import { ToolLoopAgent, createAgentUIStreamResponse } from "ai";
import type { Hono } from "hono";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const agent = new ToolLoopAgent({
  model: deepseek("deepseek-chat"),
  instructions: "You are a helpful assistant.",
  tools: {},
});

/**
 * Streaming chat endpoint using AI SDK agent UI stream.
 * Endpoint: POST /chat/sse  body: { messages: ChatMessage[] }
 */
export const registerChatSse = (app: Hono) => {
  app.post("/chat/sse", async (c) => {
    let messages: ChatMessage[];
    try {
      const body = await c.req.json();
      messages = body?.messages;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!Array.isArray(messages)) {
      return c.json({ error: "messages must be an array" }, 400);
    }

    return createAgentUIStreamResponse({
      agent,
      messages,
    });
  });
};
