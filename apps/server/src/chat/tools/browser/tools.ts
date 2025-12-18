import { tool, zodSchema } from "ai";
import { requestContextManager } from "@/context/requestContext";
import { openUrlTool } from "./openUrl";
import {
  playwrightClickTool,
  playwrightCookiesTool,
  playwrightDomSnapshotTool,
  playwrightDragTool,
  playwrightEvaluateScriptTool,
  playwrightFillFormTool,
  playwrightFillTool,
  playwrightGetConsoleMessageTool,
  playwrightGetNetworkRequestTool,
  playwrightHoverTool,
  playwrightListConsoleMessagesTool,
  playwrightListNetworkRequestsTool,
  playwrightNavigatePageTool,
  playwrightNetworkGetResponseBodyTool,
  playwrightPressKeyTool,
  playwrightStorageTool,
  playwrightTakeSnapshotTool,
  playwrightWaitForTool,
} from "./playwrightMcp";
import {
  browserGetTabsToolDef,
  browserGetCurrentTabToolDef,
  openUrlToolDef,
} from "@teatime-ai/api/types/tools/browser";
import {
  playwrightClickToolDef,
  playwrightCookiesToolDef,
  playwrightDomSnapshotToolDef,
  playwrightDragToolDef,
  playwrightEvaluateScriptToolDef,
  playwrightFillFormToolDef,
  playwrightFillToolDef,
  playwrightGetConsoleMessageToolDef,
  playwrightGetNetworkRequestToolDef,
  playwrightHoverToolDef,
  playwrightListConsoleMessagesToolDef,
  playwrightListNetworkRequestsToolDef,
  playwrightNavigatePageToolDef,
  playwrightNetworkGetResponseBodyToolDef,
  playwrightPressKeyToolDef,
  playwrightStorageToolDef,
  playwrightTakeSnapshotToolDef,
  playwrightWaitForToolDef,
} from "@teatime-ai/api/types/tools/playwright";

export const browserTools = {
  // ======
  // MVP：读取前端传来的 tab 上下文（用于 agent 感知用户环境）
  // ======
  [browserGetTabsToolDef.id]: tool({
    description: browserGetTabsToolDef.description,
    inputSchema: zodSchema(browserGetTabsToolDef.parameters),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      return { ok: true, data: state?.tabs ?? [] };
    },
  }),

  [browserGetCurrentTabToolDef.id]: tool({
    description: browserGetCurrentTabToolDef.description,
    inputSchema: zodSchema(browserGetCurrentTabToolDef.parameters),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      const activeTab = state?.tabs?.find((t) => t.id === state.activeTabId);
      return { ok: true, data: activeTab ?? null };
    },
  }),

  // ======
  // MVP：打开网址（UI 驱动）
  // ======
  [openUrlToolDef.id]: openUrlTool,

  // ======
  // MVP：Playwright / CDP（参考 chrome-devtools-mcp 的交互方式）
  // ======
  [playwrightTakeSnapshotToolDef.id]: playwrightTakeSnapshotTool,
  [playwrightClickToolDef.id]: playwrightClickTool,
  [playwrightHoverToolDef.id]: playwrightHoverTool,
  [playwrightDragToolDef.id]: playwrightDragTool,
  [playwrightFillToolDef.id]: playwrightFillTool,
  [playwrightFillFormToolDef.id]: playwrightFillFormTool,
  [playwrightPressKeyToolDef.id]: playwrightPressKeyTool,
  [playwrightNavigatePageToolDef.id]: playwrightNavigatePageTool,
  [playwrightWaitForToolDef.id]: playwrightWaitForTool,
  [playwrightEvaluateScriptToolDef.id]: playwrightEvaluateScriptTool,
  [playwrightDomSnapshotToolDef.id]: playwrightDomSnapshotTool,
  [playwrightListNetworkRequestsToolDef.id]: playwrightListNetworkRequestsTool,
  [playwrightGetNetworkRequestToolDef.id]: playwrightGetNetworkRequestTool,
  [playwrightNetworkGetResponseBodyToolDef.id]: playwrightNetworkGetResponseBodyTool,
  [playwrightListConsoleMessagesToolDef.id]: playwrightListConsoleMessagesTool,
  [playwrightGetConsoleMessageToolDef.id]: playwrightGetConsoleMessageTool,
  [playwrightStorageToolDef.id]: playwrightStorageTool,
  [playwrightCookiesToolDef.id]: playwrightCookiesTool,

  // ======
  // MVP：通用 UI 事件（通过 SSE 推送给前端）
  // ======
} as const;

// settings 模式用：不暴露 UI 操作能力（MVP 权限边界）
export const browserReadonlyTools = {
  [browserGetTabsToolDef.id]: browserTools[browserGetTabsToolDef.id],
  [browserGetCurrentTabToolDef.id]:
    browserTools[browserGetCurrentTabToolDef.id],
} as const;
