import { getTabId } from "@/ai/chat-stream/requestContext";

/**
 * 读取本次 /chat/sse 绑定的 TabId（apps/web 的 useTabs Tab.id）。
 */
export function requireTabId(): string {
  const tabId = getTabId();
  if (!tabId) throw new Error("tabId is required.");
  return tabId;
}
