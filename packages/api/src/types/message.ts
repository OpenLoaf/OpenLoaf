import type { UIMessage } from "ai";

export type TreeUIMessage = UIMessage & {
  /** 消息树：父消息 ID（根节点为 null） */
  parentMessageId?: string | null;
};

/**
 * 约定请求体（MVP）：
 * - `sessionId`：用于从 DB 读取/写入该会话的历史消息
 * - `messages`：前端当前要发送的 UIMessage 列表（当前实现只取最后一条作为"新消息"）
 */
export type ChatRequestBody = {
  sessionId?: string;
  id?: string;
  messages?: TreeUIMessage[];
  /** 业务参数（如 pageId/mode 等），由前端透传 */
  params?: Record<string, unknown>;
  /** AI SDK transport 触发来源 */
  trigger?: "submit-message" | "regenerate-message" | string;
  /** regenerate 时的 messageId（AI SDK transport 提供） */
  messageId?: string;
  /**
   * 是否为 retry：
   * - true：复用已存在的 user 消息重新生成 assistant（服务端禁止再次保存该 user 消息）
   * - false/undefined：正常新消息
   */
  retry?: boolean;
  /** Web UI 侧稳定 clientId（用于断线续传关联） */
  webClientId?: string;
  /** Electron runtime 设备标识（仅 Electron 环境提供） */
  electronClientId?: string;
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
