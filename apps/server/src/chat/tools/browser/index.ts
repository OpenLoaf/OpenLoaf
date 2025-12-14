import { tool, zodSchema } from "ai";
import { z } from "zod";
import { requestContextManager } from "../../../context/requestContext";

export const browserTools = {
  getTabs: tool({
    description: "Get all open tabs information from the user's browser",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      return { ok: true, data: state?.tabs ?? [] };
    },
  }),
  getCurrentTab: tool({
    description: "Get the currently active tab information",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const state = requestContextManager.getTabsState();
      const activeTab = state?.tabs?.find((t) => t.id === state.activeTabId);
      return { ok: true, data: activeTab ?? null };
    },
  }),
};
