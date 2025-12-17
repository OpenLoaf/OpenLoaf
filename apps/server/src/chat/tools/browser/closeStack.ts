import { tool, zodSchema } from "ai";
import { emitUiEvent, requireActiveTab } from "@/chat/ui/emit";
import { uiEvents } from "@teatime-ai/api/types/event";
import { uiCloseStackToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// MVP：UI 工具 - 关闭左侧 stack overlay
// ==========

/**
 * 关闭当前 Tab 的 stack overlay（仅 UI 操作，不影响数据）。
 */
export const uiCloseStackTool = tool({
  description: uiCloseStackToolDef.description,
  inputSchema: zodSchema(uiCloseStackToolDef.parameters),
  execute: async () => {
    const activeTab = requireActiveTab();
    emitUiEvent(uiEvents.closeStack({ tabId: activeTab.id }));
    return { ok: true };
  },
});

