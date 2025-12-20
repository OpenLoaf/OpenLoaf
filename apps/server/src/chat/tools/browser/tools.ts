import { tool, zodSchema } from "ai";
import { requestContextManager } from "@/context/requestContext";
import { buildTabSnapshotCacheKey, getTabSnapshot } from "@/context/tabSnapshotCache";
import { openUrlTool } from "./openUrl";
import { uiCloseStackTool } from "./closeStack";
import { uiRefreshPageTreeTool } from "./refreshPageTree";
import { uiRefreshBasePanelTool } from "./refreshBasePanel";
import {
  playwrightActTool,
  playwrightDiagnosticsTool,
  playwrightPageTool,
  playwrightSnapshotTool,
  playwrightVerifyTool,
  playwrightWaitTool,
} from "./playwright";
import {
  browserGetTabsToolDef,
  browserGetCurrentTabToolDef,
  openUrlToolDef,
  uiCloseStackToolDef,
  uiRefreshPageTreeToolDef,
  uiRefreshBasePanelToolDef,
} from "@teatime-ai/api/types/tools/browser";
import {
  playwrightActToolDef,
  playwrightDiagnosticsToolDef,
  playwrightPageToolDef,
  playwrightSnapshotToolDef,
  playwrightVerifyToolDef,
  playwrightWaitToolDef,
} from "@teatime-ai/api/types/tools/playwright";

export const browserTools = {
  // ======
  // MVP：从 server 侧 TTL 缓存读取 Tab 快照（Web 在 SSE 期间持续上报）
  // ======
  [browserGetTabsToolDef.id]: tool({
    description: browserGetTabsToolDef.description,
    inputSchema: zodSchema(browserGetTabsToolDef.parameters),
    execute: async () => {
      const sessionId = requestContextManager.getSessionId();
      const webClientId = requestContextManager.getWebClientId();
      const tabId = requestContextManager.getTabId();
      if (!sessionId || !webClientId || !tabId) return { ok: true, data: [] };
      const key = buildTabSnapshotCacheKey({ sessionId, webClientId, tabId });
      const tab = getTabSnapshot(key);
      return { ok: true, data: tab ? [tab] : [] };
    },
  }),

  [browserGetCurrentTabToolDef.id]: tool({
    description: browserGetCurrentTabToolDef.description,
    inputSchema: zodSchema(browserGetCurrentTabToolDef.parameters),
    execute: async () => {
      const sessionId = requestContextManager.getSessionId();
      const webClientId = requestContextManager.getWebClientId();
      const tabId = requestContextManager.getTabId();
      if (!sessionId || !webClientId || !tabId) return { ok: true, data: null };
      const key = buildTabSnapshotCacheKey({ sessionId, webClientId, tabId });
      const tab = getTabSnapshot(key);
      return { ok: true, data: tab ?? null };
    },
  }),

  // ======
  // MVP：打开网址（UI 驱动）
  // ======
  [openUrlToolDef.id]: openUrlTool,

  // ======
  // MVP：Playwright / CDP（参考 chrome-devtools-mcp 的交互方式）
  // ======
  [playwrightSnapshotToolDef.id]: playwrightSnapshotTool,
  [playwrightActToolDef.id]: playwrightActTool,
  [playwrightWaitToolDef.id]: playwrightWaitTool,
  [playwrightVerifyToolDef.id]: playwrightVerifyTool,
  [playwrightDiagnosticsToolDef.id]: playwrightDiagnosticsTool,
  [playwrightPageToolDef.id]: playwrightPageTool,

  // ======
  // UI 控制（通过 runtime -> IPC）
  // ======
  [uiCloseStackToolDef.id]: uiCloseStackTool,
  [uiRefreshPageTreeToolDef.id]: uiRefreshPageTreeTool,
  [uiRefreshBasePanelToolDef.id]: uiRefreshBasePanelTool,
} as const;

// settings 模式用：不暴露 UI 操作能力（MVP 权限边界）
export const browserReadonlyTools = {
  [browserGetTabsToolDef.id]: browserTools[browserGetTabsToolDef.id],
  [browserGetCurrentTabToolDef.id]:
    browserTools[browserGetCurrentTabToolDef.id],
} as const;
