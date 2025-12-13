import { deepseek } from "@ai-sdk/deepseek";
import {
  type InferAgentUIMessage,
  type UIMessage,
  ToolLoopAgent,
  createAgentUIStreamResponse,
} from "ai";
import type { Hono } from "hono";
import { saveAndAppendMessage } from "./history";
import { systemTools } from "./tools";

/**
 * 约定请求体（MVP）：
 * - `sessionId`：用于从 DB 读取/写入该会话的历史消息
 * - `messages`：前端当前要发送的 UIMessage 列表（当前实现只取最后一条作为“新消息”）
 */
type ChatRequestBody = {
  sessionId?: string;
  id?: string;
  messages?: UIMessage[];
};

const agent = new ToolLoopAgent({
  model: deepseek("deepseek-chat"),
  instructions:
    `
    你是一个帮助用户解决问题的助手，请根据用户的问题，给出最简短的回答。
    返回的内容一定是markdown语法格式的
    `,
  // System Tools（MVP）：这里只注入“定义”，暂不实现内部逻辑。
  tools: systemTools,
});

type AgentUIMessage = InferAgentUIMessage<typeof agent>;

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

type TokenUsageMessage = UIMessage<{
  totalUsage?: TokenUsage;
}>;

/**
 * AI SDK v6：流式对话接口（SSE/数据流协议由 createAgentUIStreamResponse 负责）。
 *
 * 流程（MVP）：
 * 1) 根据 sessionId 从 DB 读取历史
 * 2) 把刚收到的新消息先写入 DB
 * 3) 将“完整历史（含新消息）”喂给 agent，进行流式生成
 */
export const registerChatSse = (app: Hono) => {
  app.post("/chat/sse", async (c) => {
    let body: ChatRequestBody;
    try {
      body = (await c.req.json()) as ChatRequestBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const sessionId = body.sessionId ?? body.id;
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const incomingMessages = body.messages;
    if (incomingMessages !== undefined && !Array.isArray(incomingMessages)) {
      return c.json({ error: "messages must be an array" }, 400);
    }

    // MVP：客户端会带 messages，但这里只取最后一条当作“新消息”进行保存与追加。
    const lastIncomingMessage = Array.isArray(incomingMessages)
      ? incomingMessages[incomingMessages.length - 1]
      : undefined;

    const messages = await saveAndAppendMessage({
      sessionId,
      incomingMessage: lastIncomingMessage,
    });

    return createAgentUIStreamResponse({
      agent,
      // 将 DB 还原出来的完整历史传给 agent（类型用 InferAgentUIMessage 约束）。
      messages: messages as AgentUIMessage[],
      messageMetadata: ({ part }) => {
        // 当生成完成时发送完整的 token 使用信息
        if (part.type === "finish") {
          return {
            totalUsage: part.totalUsage,
          };
        }
      },
      // 流式结束后：记录 token 使用情况，并把 AI 返回的最终消息落库（含 usage）。
      onFinish: async ({ isAborted, messages, responseMessage }) => {
        if (isAborted) return;

        const lastMessage = messages[messages.length - 1] as TokenUsageMessage;
        const usage =
          lastMessage?.metadata?.totalUsage ??
          (responseMessage as TokenUsageMessage)?.metadata?.totalUsage;

        if (usage) {
          console.log("Token 使用情况:", {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            reasoningTokens: usage.reasoningTokens,
            cachedInputTokens: usage.cachedInputTokens,
            chatId: sessionId,
          });
        }

        // 只保存 AI 的最终回复（MVP）；若需要保存整个 messages，可扩展为批量写入。
        if (responseMessage?.role !== "assistant") return;

        const messageToSave: UIMessage = usage
          ? {
              ...responseMessage,
              metadata: {
                ...(responseMessage as any).metadata,
                totalUsage: usage,
              },
            }
          : responseMessage;

        await saveAndAppendMessage({
          sessionId,
          incomingMessage: messageToSave,
        });
      },
    });
  });
};
