import type { UIDataTypes, UIMessage, UITools } from "ai";

/**
 * Teatime 的 Agent 信息（参考 AI SDK 的 Agent/ToolLoopAgentSettings 设计）
 * - 只存可序列化字段，用于 UI 展示与历史持久化
 */
export type TeatimeAgentInfo = {
  /** AI SDK Agent 版本标识（对齐 ai/dist 的 Agent.version） */
  version?: "agent-v1";
  /** 业务 agentId（例如 master/browser/...） */
  id?: string;
  /** 业务展示名称 */
  name?: string;
  /** 业务分类：master/sub */
  kind?: "master" | "sub" | string;
  /** 模型信息（MVP：只存 provider + modelId） */
  model?: {
    provider: string;
    modelId: string;
  };
};

/**
 * Teatime UIMessage（用于前端渲染/历史接口）
 * - 扩展 parentMessageId（消息树）
 * - 扩展 agent（用于展示该消息由哪个 agent/model 产生）
 *
 * 约束：
 * - UIMessage.role 仍然遵循 AI SDK：system/user/assistant
 * - metadata 保持原生 unknown（类型层不强约束）；持久化层负责剔除消息树字段
 */
export interface TeatimeUIMessage extends UIMessage<unknown, TeatimeUIDataTypes, UITools> {
  /** 消息树：父消息 ID（根节点为 null） */
  parentMessageId: string | null;
  /** 产生该消息的 agent 信息（可选；流式阶段可能缺失） */
  agent?: TeatimeAgentInfo;
}

/**
 * Teatime UI data parts：
 * - sub-agent：把 subAgent 的输出消息结构包进 data part，便于 UI 复用同一套渲染逻辑
 */
export interface TeatimeUIDataTypes extends UIDataTypes {
  "sub-agent": TeatimeUIMessage;
}

/**
 * 约定请求体（MVP）：
 * - `sessionId`：用于从 DB 读取/写入该会话的历史消息
 * - `messages`：前端当前要发送的 UIMessage 列表（当前实现只取最后一条作为"新消息"）
 */
export type ChatRequestBody = {
  sessionId?: string;
  id?: string;
  messages?: TeatimeUIMessage[];
  /** 业务参数（如 pageId/mode 等），由前端透传 */
  params?: Record<string, unknown>;
  /** 当前应用 TabId（apps/web 的 useTabs 中的 Tab.id），用于 server 在本次 SSE 中绑定“操作目标 Tab”。 */
  tabId?: string;
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
  clientId?: string;
  /** Electron appId（仅 Electron 环境提供；用于调度到具体桌面端） */
  appId?: string;
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
