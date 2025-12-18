import type { Tab } from "@teatime-ai/api/common";
import { requestContextManager } from "@/context/requestContext";

// ==========
// 请求上下文：tools 读取 activeTab
// ==========

export function requireActiveTab(): Tab {
  const tab = requestContextManager.getContext()?.activeTab;
  if (!tab) throw new Error("activeTab is required.");
  return tab;
}
