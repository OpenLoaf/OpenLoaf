import { tool, zodSchema } from "ai";
import { z } from "zod";
import { requestContextManager } from "@/context/requestContext";
import { openUrlTool } from "./openUrl";

export const browserTools = {
  // ======
  // MVP：读取前端传来的 tab 上下文（用于 agent 感知用户环境）
  // ======
  getTabs: tool({
    description: "获取用户当前可见的 tabs（MVP：仅包含 activeTab）。",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      return { ok: true, data: state?.tabs ?? [] };
    },
  }),

  getCurrentTab: tool({
    description: "获取用户当前激活的 tab（MVP）。",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      const activeTab = state?.tabs?.find((t) => t.id === state.activeTabId);
      return { ok: true, data: activeTab ?? null };
    },
  }),

  // ======
  // MVP：打开网址（UI 驱动）
  // ======
  open_url: openUrlTool,
};

// settings 模式用：不暴露 UI 操作能力（MVP 权限边界）
export const browserReadonlyTools = {
  getTabs: browserTools.getTabs,
  getCurrentTab: browserTools.getCurrentTab,
};

