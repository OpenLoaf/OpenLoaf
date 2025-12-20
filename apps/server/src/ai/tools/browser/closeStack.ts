import { tool, zodSchema } from "ai";
import { requireTabId } from "@/shared/tabContext";
import { emitRuntimeUiEvent } from "@/modules/runtime/application/runtimeUi";
import { uiEvents } from "@teatime-ai/api/types/event";
import { uiCloseStackToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// UI 工具 - 关闭左侧 stack overlay（通过 runtime -> IPC）
// ==========

export const uiCloseStackTool = tool({
  description: uiCloseStackToolDef.description,
  inputSchema: zodSchema(uiCloseStackToolDef.parameters),
  execute: async () => {
    const tabId = requireTabId();
    await emitRuntimeUiEvent(uiEvents.closeStack({ tabId }));
    return { ok: true };
  },
});
