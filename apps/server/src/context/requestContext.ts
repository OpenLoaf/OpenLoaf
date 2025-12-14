import type { Tab } from "@teatime-ai/api/types/tabs";
import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  sessionId: string;
  cookies: Record<string, string>;
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
    return this.getCookie("workspace-id");
  }

  /**
   * 获取tabs状态
   */
  getTabsState(): { tabs: Tab[]; activeTabId: string | null } | undefined {
    const tabsCookie = this.getCookie("tabs-storage");
    if (!tabsCookie) {
      return undefined;
    }
    try {
      const decoded = decodeURIComponent(tabsCookie);
      const parsed = JSON.parse(decoded);
      if (parsed && parsed.state) {
        return parsed.state;
      }
    } catch (e) {
      console.error("Failed to parse tabs cookie", e);
    }
    return undefined;
  }
}

export const requestContextManager = RequestContextManager.getInstance();
