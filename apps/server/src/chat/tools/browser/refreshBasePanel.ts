import { tool, zodSchema } from "ai";
import { requireTabId } from "@/chat/ui/tabContext";
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
    const tabId = requireTabId();
    await emitRuntimeUiEvent(uiEvents.refreshBasePanel({ tabId }));
    return { ok: true };
  },
});
