import type { UIMessage } from "ai";

/**
 * 约定请求体（MVP）：
 * - `sessionId`：用于从 DB 读取/写入该会话的历史消息
 * - `messages`：前端当前要发送的 UIMessage 列表（当前实现只取最后一条作为"新消息"）
 */
export type ChatRequestBody = {
  sessionId?: string;
  id?: string;
  messages?: UIMessage[];
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

export type TokenUsageMessage = UIMessage<{
  totalUsage?: TokenUsage;
}>;
