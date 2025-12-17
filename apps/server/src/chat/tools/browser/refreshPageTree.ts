import { tool, zodSchema } from "ai";
import { emitUiEvent, requireActiveTab } from "@/chat/ui/emit";
import { uiEvents } from "@teatime-ai/api/types/event";
import { uiRefreshPageTreeToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// MVP：UI 工具 - 刷新 Page Tree
// ==========

/**
 * 刷新当前 Tab 的 Page Tree（通常用于侧边栏页面树数据同步）。
 */
export const uiRefreshPageTreeTool = tool({
  description: uiRefreshPageTreeToolDef.description,
  inputSchema: zodSchema(uiRefreshPageTreeToolDef.parameters),
  execute: async () => {
    const activeTab = requireActiveTab();
    emitUiEvent(uiEvents.refreshPageTree({ tabId: activeTab.id }));
    return { ok: true };
  },
});

