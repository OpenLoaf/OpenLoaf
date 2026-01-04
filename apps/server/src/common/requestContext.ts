import type { UIMessageStreamWriter } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ChatModelSource } from "@teatime-ai/api/common";
import { AsyncLocalStorage } from "node:async_hooks";

export type AgentFrame = {
  kind: "master" | "sub";
  name: string;
  agentId: string;
  path: string[];
  model?: { provider: string; modelId: string };
};

export type ResolvedChatModelSnapshot = {
  /** Resolved AI SDK model for this request. */
  model: LanguageModelV3;
  /** Provider/model metadata for logging and UI. */
  modelInfo: { provider: string; modelId: string };
  /** Resolved chatModelId used in this request. */
  chatModelId: string;
};

export type RequestContext = {
  /** Chat session id for this request. */
  sessionId: string;
  /** Cookie snapshot for this request. */
  cookies: Record<string, string>;
  /** Web client id for stream reconnect. */
  clientId?: string;
  /** Tab id for UI event targeting. */
  tabId?: string;
  /** Requested chatModelId from the client. */
  chatModelId?: string;
  /** Requested chat model source from the client. */
  chatModelSource?: ChatModelSource;
  /** Resolved model snapshot for sub-agent reuse. */
  resolvedChatModel?: ResolvedChatModelSnapshot;
  /** Active UI stream writer for tool chunks. */
  uiWriter?: UIMessageStreamWriter<any>;
  /** Abort signal for cooperative cancellation. */
  abortSignal?: AbortSignal;
  /** Agent frame stack for nested agents. */
  agentStack?: AgentFrame[];
};

const storage = new AsyncLocalStorage<RequestContext>();

/** 设置本次请求上下文（每次 /chat/sse 都会调用一次）。 */
export function setRequestContext(ctx: RequestContext) {
  storage.enterWith(ctx);
}

/** 获取本次请求上下文（可能为空）。 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** 获取会话 id（用于落库/日志/权限边界）。 */
export function getSessionId(): string | undefined {
  return getRequestContext()?.sessionId;
}

/** 获取 cookies（MVP：workspaceId 从 cookie 读取）。 */
export function getCookies(): Record<string, string> | undefined {
  return getRequestContext()?.cookies;
}

/** 获取单个 cookie 值。 */
export function getCookie(name: string): string | undefined {
  return getCookies()?.[name];
}

/** 获取 workspaceId（MVP：只从 cookie `workspace-id` 读取）。 */
export function getWorkspaceId(): string | undefined {
  return getCookie("workspace-id");
}

/** 获取 web clientId（用于断线续传/会话隔离）。 */
export function getClientId(): string | undefined {
  return getRequestContext()?.clientId;
}

/** 获取当前应用 TabId（用于绑定 UI 操作目标）。 */
export function getTabId(): string | undefined {
  return getRequestContext()?.tabId;
}

/** 获取请求的 chatModelId（用于子 Agent 复用）。 */
export function getChatModelId(): string | undefined {
  return getRequestContext()?.chatModelId;
}

/** 获取请求的 chatModelSource（用于子 Agent 复用）。 */
export function getChatModelSource(): ChatModelSource | undefined {
  return getRequestContext()?.chatModelSource;
}

/** 写入已解析的模型信息（用于子 Agent 复用）。 */
export function setResolvedChatModel(resolved: ResolvedChatModelSnapshot) {
  const ctx = getRequestContext();
  if (!ctx) return;
  // 中文注释：只保留必要字段，避免把 provider 配置泄漏到上下文里。
  ctx.resolvedChatModel = resolved;
}

/** 读取已解析的模型信息（用于子 Agent 复用）。 */
export function getResolvedChatModel(): ResolvedChatModelSnapshot | undefined {
  return getRequestContext()?.resolvedChatModel;
}

/** 设置 UI writer（tools 需要往前端推送 chunk）。 */
export function setUiWriter(writer: UIMessageStreamWriter<any>) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.uiWriter = writer;
}

/** 获取 UI writer（可能为空）。 */
export function getUiWriter(): UIMessageStreamWriter<any> | undefined {
  return getRequestContext()?.uiWriter;
}

/** 设置 abortSignal（stopGenerating 需要协作式中断）。 */
export function setAbortSignal(signal: AbortSignal) {
  const ctx = getRequestContext();
  if (!ctx) return;
  ctx.abortSignal = signal;
}

/** 获取 abortSignal（可能为空）。 */
export function getAbortSignal(): AbortSignal | undefined {
  return getRequestContext()?.abortSignal;
}

/** 获取 agent 栈（MVP：用于打标消息来源）。 */
export function getAgentStack(): AgentFrame[] {
  const ctx = getRequestContext();
  if (!ctx) return [];
  if (!ctx.agentStack) ctx.agentStack = [];
  return ctx.agentStack;
}

/** 获取当前 agent frame（栈顶）。 */
export function getCurrentAgentFrame(): AgentFrame | undefined {
  const stack = getAgentStack();
  return stack[stack.length - 1];
}

/** 入栈一个 agent frame（用于 sub-agent 期间标记）。 */
export function pushAgentFrame(frame: AgentFrame) {
  getAgentStack().push(frame);
}

/** 出栈一个 agent frame。 */
export function popAgentFrame(): AgentFrame | undefined {
  const stack = getAgentStack();
  return stack.pop();
}
