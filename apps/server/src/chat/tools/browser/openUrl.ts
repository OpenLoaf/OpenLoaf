import type { DockItem } from "@teatime-ai/api/common";
import { tool, zodSchema } from "ai";
import { emitUiEvent, requireActiveTab } from "@/chat/ui/emit";
import { stableIdFromUrl } from "@/chat/ui/ids";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";

// ==========
// MVP：浏览器能力（通过 UI 事件驱动前端打开 BrowserWindow）
// ==========

function buildBrowserWindowDockItem({
  url,
  title,
}: {
  url: string;
  title?: string;
}): DockItem {
  const key = stableIdFromUrl(url);
  return {
    id: `browser-window:${key}`,
    sourceKey: key,
    component: "electron-browser-window",
    title: title ?? "Browser Window",
    params: { url, autoOpen: true },
  };
}

export const openUrlTool = tool({
  description: openUrlToolDef.description,
  inputSchema: zodSchema(openUrlToolDef.parameters),
  execute: async ({ url, title }) => {
    const activeTab = requireActiveTab();
    emitUiEvent({
      kind: "push-stack-item",
      tabId: activeTab.id,
      item: buildBrowserWindowDockItem({ url, title }),
    });
    return { ok: true };
  },
});
