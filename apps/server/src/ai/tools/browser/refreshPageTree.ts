import { tool, zodSchema } from "ai";
import { emitRuntimeUiEvent } from "@/modules/runtime/runtimeUi";
import { uiEvents } from "@teatime-ai/api/types/event";
import { uiRefreshPageTreeToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// UI 工具 - 刷新 Page Tree（通过 runtime -> IPC）
// ==========

export const uiRefreshPageTreeTool = tool({
  description: uiRefreshPageTreeToolDef.description,
  inputSchema: zodSchema(uiRefreshPageTreeToolDef.parameters),
  execute: async () => {
    await emitRuntimeUiEvent(uiEvents.refreshPageTree());
    return { ok: true };
  },
});
