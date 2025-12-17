import type { Tab } from "@teatime-ai/api/types/tabs";
import type { UIMessageStreamWriter } from "ai";
import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  sessionId: string;
  cookies: Record<string, string>;
  activeTab?: Tab;
  uiWriter?: UIMessageStreamWriter<any>;
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

  /**
   * 创建请求上下文
   */
  createContext(context: RequestContext): void {
    this.storage.enterWith(context);
  }

  /**
   * 获取当前请求上下文
   */
  getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /**
   * 获取当前会话ID
   */
  getSessionId(): string | undefined {
    return this.getContext()?.sessionId;
  }

  /**
   * 获取当前请求的cookie
   */
  getCookies(): Record<string, string> | undefined {
    return this.getContext()?.cookies;
  }

  /**
   * 获取指定cookie值
   */
  getCookie(name: string): string | undefined {
    return this.getCookies()?.[name];
  }

  getWorkspaceId(): string | undefined {
    // 优先用前端传来的 activeTab（去耦 tabs-storage / cookie 依赖）
    return this.getContext()?.activeTab?.workspaceId ?? this.getCookie("workspace-id");
  }

  // 仅保留“请求内上下文”中的 tabs（MVP：当前只需要 activeTab）
  getTabsState(): { tabs: Tab[]; activeTabId: string | null } | undefined {
    const activeTab = this.getContext()?.activeTab;
    if (!activeTab) return undefined;
    return { tabs: [activeTab], activeTabId: activeTab.id };
  }

  // 关键：Streaming Custom Data 需要 tools 里可拿到 writer 往前端推事件
  setUIWriter(writer: UIMessageStreamWriter<any>) {
    const ctx = this.getContext();
    if (!ctx) return;
    ctx.uiWriter = writer;
  }

  getUIWriter(): UIMessageStreamWriter<any> | undefined {
    return this.getContext()?.uiWriter;
  }
}

export const requestContextManager = RequestContextManager.getInstance();
