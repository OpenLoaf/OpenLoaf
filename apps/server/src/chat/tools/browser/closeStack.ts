import { tool, zodSchema } from "ai";
import { requireActiveTab } from "@/chat/ui/emit";
import { emitRuntimeUiEvent } from "@/chat/ui/runtimeUi";
import { uiEvents } from "@teatime-ai/api/types/event";
import { uiCloseStackToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// UI 工具 - 关闭左侧 stack overlay（通过 runtime -> IPC）
// ==========

export const uiCloseStackTool = tool({
  description: uiCloseStackToolDef.description,
  inputSchema: zodSchema(uiCloseStackToolDef.parameters),
  execute: async () => {
    const activeTab = requireActiveTab();
    await emitRuntimeUiEvent(uiEvents.closeStack({ tabId: activeTab.id }));
    return { ok: true };
  },
});

