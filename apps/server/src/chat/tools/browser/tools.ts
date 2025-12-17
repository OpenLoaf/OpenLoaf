import { tool, zodSchema } from "ai";
import { requestContextManager } from "@/context/requestContext";
import { openUrlTool } from "./openUrl";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import {
  browserGetTabsToolDef,
  browserGetCurrentTabToolDef,
} from "@teatime-ai/api/types/tools/browser";

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
} as const;

// settings 模式用：不暴露 UI 操作能力（MVP 权限边界）
export const browserReadonlyTools = {
  [browserGetTabsToolDef.id]: browserTools[browserGetTabsToolDef.id],
  [browserGetCurrentTabToolDef.id]:
    browserTools[browserGetCurrentTabToolDef.id],
} as const;
