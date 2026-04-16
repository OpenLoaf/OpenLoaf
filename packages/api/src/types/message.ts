/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ChatModelSource, ModelDefinition } from "../common/modelTypes";
import type { ClientPlatform } from "./platform";

type UIDataTypes = Record<string, unknown>;
type UITools = Record<string, unknown>;
type UIMessage<D = unknown, DT = UIDataTypes, T = UITools> = {
  id: string;
  role: "system" | "user" | "assistant" | "subagent" | "task-report";
  parts: any[];
  metadata?: any;
};

/** Chat message kind for compaction handling. */
export type ChatMessageKind =
  | "normal"
  | "error"
  | "compact_prompt"
  | "compact_summary";

/**
 * OpenLoaf 的 Agent 信息（参考 AI SDK 的 Agent/ToolLoopAgentSettings 设计）
 * - 只存可序列化字段，用于 UI 展示与历史持久化
 */
export type OpenLoafAgentInfo = {
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
  /** 业务选择的 chatModelId */
  chatModelId?: string;
  /** 模型定义信息（用于展示/统计） */
  modelDefinition?: ModelDefinition;
};

/**
 * OpenLoaf UIMessage（用于前端渲染/历史接口）
 * - 扩展 parentMessageId（消息树）
 * - 扩展 agent（用于展示该消息由哪个 agent/model 产生）
 *
 * 约束：
 * - UIMessage.role 仍然遵循 AI SDK：system/user/assistant
 * - metadata 保持原生 unknown（类型层不强约束）；持久化层负责剔除消息树字段
 */
export interface OpenLoafUIMessage extends UIMessage<unknown, OpenLoafUIDataTypes, UITools> {
  /** 消息树：父消息 ID（根节点为 null） */
  parentMessageId: string | null;
  /** Message kind for compaction handling. */
  messageKind?: ChatMessageKind;
  /** 产生该消息的 agent 信息（可选；流式阶段可能缺失） */
  agent?: OpenLoafAgentInfo;
}

/**
 * OpenLoaf UI data parts。
 */
export interface OpenLoafUIDataTypes extends UIDataTypes {
  "open-browser": {
    tabId: string;
    url: string;
    title?: string;
    viewKey: string;
    panelKey: string;
  };
  skill: {
    name: string;
    path: string;
    scope: "project" | "parent" | "global";
    content: string;
  };
  "session-title": {
    sessionId: string;
    title: string;
  };
}

/**
 * 约定请求体（MVP）：
 * - `sessionId`：用于从 DB 读取/写入该会话的历史消息
 * - `messages`：前端当前要发送的 UIMessage 列表（当前实现只取最后一条作为"新消息"）
 */
export type ChatRequestBody = {
  sessionId?: string;
  id?: string;
  messages?: OpenLoafUIMessage[];
  /** 业务参数（如 mode 等），由前端透传 */
  params?: Record<string, unknown>;
  /** 当前应用 TabId（apps/web 的 useTabs 中的 Tab.id），用于 server 在本次 SSE 中绑定“操作目标 Tab”。 */
  tabId?: string;
  /** AI SDK transport 触发来源 */
  trigger?: "submit-message" | "regenerate-message" | string;
  /** regenerate 时的 messageId（AI SDK transport 提供） */
  messageId?: string;
  /** Intent for unified AI endpoint. */
  intent?: "chat" | "image" | "command" | "utility";
  /** Response mode for unified AI endpoint. */
  responseMode?: "stream" | "json";
  /**
   * 是否为 retry：
   * - true：复用已存在的 user 消息重新生成 assistant（服务端禁止再次保存该 user 消息）
   * - false/undefined：正常新消息
   */
  retry?: boolean;
  /**
   * 是否为续写模式：
   * - true：从中断的 assistant turn 断点继续（后端读取 partial assistant parts 注入 modelMessages）
   * - false/undefined：正常新消息
   */
  continue?: boolean;
  /** Web UI 侧稳定 clientId（用于会话关联） */
  clientId?: string;
  /** Client timezone (IANA). */
  timezone?: string;
  /** Board id for associating chat sessions. */
  boardId?: string;
  /** Project id for this request. */
  projectId?: string;
  /** Image save directory uri. */
  imageSaveDir?: string;
  /** Selected skill names for this request. */
  selectedSkills?: string[];
  /** 工具审批 payload（按 toolCallId 分组）。 */
  toolApprovalPayloads?: Record<string, Record<string, unknown>>;
  /** Whether to auto-approve simple tool calls. */
  autoApproveTools?: boolean;
  /** SDK assistant UUID for CLI rewind (resumeSessionAt). */
  sdkRewindTarget?: string;
  /** Client platform for conditional tool registration. */
  clientPlatform?: ClientPlatform;
  /** Web app version for SaaS metadata. */
  webVersion?: string;
  /** Server version for SaaS metadata. */
  serverVersion?: string;
  /** Desktop (Electron) app version for SaaS metadata. */
  desktopVersion?: string;
  /** Board chat: explicit message ID chain from canvas connector graph. */
  messageIdChain?: string[];
  /** Page context for AI agent skill auto-loading. */
  pageContext?: ChatPageContext;
  /**
   * 前端明确指定的 chatModelId（例如 "deepseek:deepseek-chat"）。
   * 必须由前端在每次请求时传入 — 对应 model picker 当前活跃的模型，
   * 禁止服务端隐式从 master agent.json 回退，避免同一消息的多次 attempt
   * 因配置漂移而换模型。
   */
  chatModelId?: string;
  /** chatModelId 对应的来源（local / cloud / saas）。 */
  chatModelSource?: ChatModelSource;
  /**
   * 模型采样温度（0-2）。仅在开发模式（NODE_ENV !== 'production'）下生效，
   * 用于 ai-browser-test 等自动化测试以零温度保证结果可重复。生产构建静默忽略。
   */
  temperature?: number;
};

/**
 * 自动化探针元数据（从 session.json 派生，ai-browser-test runner 写入）。
 * 后端只读不写——probe runner 在 chat-history/<sessionId>/session.json 里追加。
 */
export interface ProbeMeta {
  runner: string;
  runnerVersion: string;
  prompt: string;
  model: string | null;
  platform: 'desktop' | 'web' | 'cli';
  startedAt: string;
}

/** Auto-test evaluation verdict from ai-browser-test evaluator subagent. */
export type AutoTestVerdict = 'PASS' | 'FAIL' | 'PARTIAL';

export interface AutoTestEvaluationEvidence {
  file: string;
  note: string;
}

export interface AutoTestEvaluator {
  name: string;
  verdict: AutoTestVerdict;
  score: number;
  pros: string[];
  cons: string[];
  evidence: AutoTestEvaluationEvidence[];
}

export interface AutoTestEvaluationAggregate {
  verdict: AutoTestVerdict;
  score: number;
  tokensTotal: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  rounds: number;
  toolCalls: string[];
  elapsedMs: number;
  model: string | null;
  summary: string;
}

/**
 * EVALUATION.json schema (ai-browser-test evaluator output).
 * 由 ai-browser-test skill 的评审子 agent 写入 `<sessionDir>/EVALUATION.json`。
 */
export interface AutoTestEvaluation {
  version: 1;
  sessionId: string;
  assistantMessageId: string;
  runner: string;
  createdAt: string;
  aggregate: AutoTestEvaluationAggregate;
  evaluators: AutoTestEvaluator[];
}

/** Return type for `chat.getAutoTestEvaluation` — null when EVALUATION.json is absent. */
export type AutoTestEvaluationResult = AutoTestEvaluation | null;

/** Part type for task references embedded in chat messages. */
export type TaskRefPart = {
  type: "task-ref";
  taskId: string;
  title: string;
  agentType: string;
  status: "running" | "completed" | "failed";
};

/** Agent identity information embedded in message metadata. */
export type AgentIdentity = {
  /** Agent role type in the multi-agent hierarchy. */
  type: "secretary" | "pm" | "specialist";
  /** Display name (e.g., "Document Writer", "PM"). */
  name: string;
  /** Associated project ID. */
  projectId?: string;
  /** Associated project title. */
  projectTitle?: string;
  /** Associated task ID. */
  taskId?: string;
};

/** Metadata for task-report messages. */
export type TaskReportMetadata = {
  taskId: string;
  agentType: string;
  displayName: string;
  projectId?: string;
  /** Structured agent identity for multi-agent rendering. */
  agentIdentity?: AgentIdentity;
};

/** Metadata for @agents/ mention routing (legacy — prefer TargetAgent). */
export type AgentMention = {
  /** Target task ID to route the message to. */
  taskId?: string;
  /** Target agent name (e.g., "pm", "coder"). */
  agentName: string;
  /** Raw prefix text (e.g., "@agents/pm"). */
  rawPrefix: string;
};

/** Target agent routing info attached to user message metadata. */
export type TargetAgent = {
  kind: 'pm';
  projectId: string;
  projectTitle?: string;
};

/**
 * Page context for AI agent skill auto-loading and context awareness.
 * Injected by frontend into chatParams, flows to server via request body.
 */
export type ChatPageContext = {
  /** Scope: global pages vs project-scoped pages. */
  scope: 'global' | 'project'
  /** Page identifier for skill mapping (component registry key). */
  page: string
  /** Human-readable page title (e.g. window tab title). */
  pageTitle?: string
  /** Project id when scope is 'project'. */
  projectId?: string
  /** Board id when on a board/canvas page. */
  boardId?: string
  /** Currently open stack panels (component + title). */
  stack?: ChatPageStackItem[]
}

export type ChatPageStackItem = {
  /** Component registry key (e.g. 'file-viewer', 'terminal-viewer'). */
  component: string
  /** Panel display title. */
  title?: string
  /** Panel params subset relevant to AI (e.g. filePath, uri). */
  params?: Record<string, unknown>
}

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
