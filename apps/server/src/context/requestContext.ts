import type { UIMessageStreamWriter } from "ai";
import { AsyncLocalStorage } from "node:async_hooks";

export type AgentFrame = {
  kind: "master" | "sub";
  name: string;
  /** agent 唯一标识（用于落库与追溯） */
  agentId: string;
  path: string[];
  /** agent 使用的模型信息（MVP：只存 provider + modelId） */
  model?: { provider: string; modelId: string };
};

type RequestContext = {
  sessionId: string;
  cookies: Record<string, string>;
  clientId?: string;
  appId?: string;
  tabId?: string;
  uiWriter?: UIMessageStreamWriter<any>;
  abortSignal?: AbortSignal;
  agentStack?: AgentFrame[];
  // 当前 master assistant 的 messageId（用于 tools 落库挂父节点）
  currentAssistantMessageId?: string;
};

class RequestContextManager {
  private static instance: RequestContextManager;
  private storage = new AsyncLocalStorage<RequestContext>();

  private constructor() {}

  static getInstance(): RequestContextManager {
    if (!RequestContextManager.instance) {
      RequestContextManager.instance = new RequestContextManager();
    }
    return RequestContextManager.instance;
  }

  /** 创建请求上下文（每次 SSE 请求都会调用一次） */
  createContext(context: RequestContext): void {
    this.storage.enterWith(context);
  }

  getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  getSessionId(): string | undefined {
    return this.getContext()?.sessionId;
  }

  getCookies(): Record<string, string> | undefined {
    return this.getContext()?.cookies;
  }

  getCookie(name: string): string | undefined {
    return this.getCookies()?.[name];
  }

  /** 当前工作区（MVP：只从 cookie 读取） */
  getWorkspaceId(): string | undefined {
    return this.getCookie("workspace-id");
  }

  getClientId(): string | undefined {
    return this.getContext()?.clientId;
  }

  getAppId(): string | undefined {
    return this.getContext()?.appId;
  }

  getTabId(): string | undefined {
    return this.getContext()?.tabId;
  }

  /** tools 需要 writer 往前端推送 tool chunks */
  setUIWriter(writer: UIMessageStreamWriter<any>) {
    const ctx = this.getContext();
    if (!ctx) return;
    ctx.uiWriter = writer;
  }

  getUIWriter(): UIMessageStreamWriter<any> | undefined {
    return this.getContext()?.uiWriter;
  }

  /** stopGenerating 需要 AbortSignal 协作式中断 tools */
  setAbortSignal(signal: AbortSignal) {
    const ctx = this.getContext();
    if (!ctx) return;
    ctx.abortSignal = signal;
  }

  getAbortSignal(): AbortSignal | undefined {
    return this.getContext()?.abortSignal;
  }

  // ======
  // agent 栈（用于给消息打来源标识）
  // ======

  getAgentStack(): AgentFrame[] {
    const ctx = this.getContext();
    if (!ctx) return [];
    if (!ctx.agentStack) ctx.agentStack = [];
    return ctx.agentStack;
  }

  getCurrentAgentFrame(): AgentFrame | undefined {
    const stack = this.getAgentStack();
    return stack[stack.length - 1];
  }

  pushAgentFrame(frame: AgentFrame) {
    this.getAgentStack().push(frame);
  }

  popAgentFrame(): AgentFrame | undefined {
    const stack = this.getAgentStack();
    return stack.pop();
  }

  /** subAgent 输出需要挂到当前 master assistant 节点下 */
  setCurrentAssistantMessageId(messageId: string) {
    const ctx = this.getContext();
    if (!ctx) return;
    ctx.currentAssistantMessageId = messageId;
  }

  getCurrentAssistantMessageId(): string | undefined {
    return this.getContext()?.currentAssistantMessageId;
  }
}

export const requestContextManager = RequestContextManager.getInstance();
