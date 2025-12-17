import { tool, zodSchema } from "ai";
import { z } from "zod";
import { requestContextManager } from "../../context/requestContext";

export const browserTools = {
  getTabs: tool({
    description: "获取用户浏览器中所有打开的标签页信息，包括标签页ID、标题、URL等。当需要了解用户当前打开的所有网页或查找特定标签页时调用此工具。",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      return { ok: true, data: state?.tabs ?? [] };
    },
  }),

  getCurrentTab: tool({
    description: "获取用户浏览器中当前激活的标签页信息，包括标签页ID、标题、URL等。当需要了解用户当前正在查看的网页时调用此工具。",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      const activeTab = state?.tabs?.find((t) => t.id === state.activeTabId);
      return { ok: true, data: activeTab ?? null };
    },
  }),
};
