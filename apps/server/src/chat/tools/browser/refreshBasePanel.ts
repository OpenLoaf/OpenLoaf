import { tool, zodSchema } from "ai";
import { emitUiEvent, requireActiveTab } from "@/chat/ui/emit";
import { uiEvents } from "@teatime-ai/api/types/event";
import { uiRefreshBasePanelToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// MVP：UI 工具 - 刷新 base 面板
// ==========

/**
 * 刷新当前 Tab 的 base 面板（通过触发 remount 实现）。
 */
export const uiRefreshBasePanelTool = tool({
  description: uiRefreshBasePanelToolDef.description,
  inputSchema: zodSchema(uiRefreshBasePanelToolDef.parameters),
  execute: async () => {
    const activeTab = requireActiveTab();
    emitUiEvent(uiEvents.refreshBasePanel({ tabId: activeTab.id }));
    return { ok: true };
  },
});

