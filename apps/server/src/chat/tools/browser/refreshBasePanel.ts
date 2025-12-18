import { tool, zodSchema } from "ai";
import { requireActiveTab } from "@/chat/ui/emit";
import { emitRuntimeUiEvent } from "@/chat/ui/runtimeUi";
import { uiEvents } from "@teatime-ai/api/types/event";
import { uiRefreshBasePanelToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// UI 工具 - 刷新 base 面板（通过 runtime -> IPC）
// ==========

export const uiRefreshBasePanelTool = tool({
  description: uiRefreshBasePanelToolDef.description,
  inputSchema: zodSchema(uiRefreshBasePanelToolDef.parameters),
  execute: async () => {
    const activeTab = requireActiveTab();
    await emitRuntimeUiEvent(uiEvents.refreshBasePanel({ tabId: activeTab.id }));
    return { ok: true };
  },
});

