import type { DockItem } from "@teatime-ai/api/types/tabs";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import { emitUiEvent, requireActiveTab } from "@/chat/ui/emit";
import { stableIdFromUrl } from "@/chat/ui/ids";

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
  description:
    "在用户当前 Tab 中打开一个网址（以左侧 stack overlay 的方式打开 BrowserWindow）。仅负责打开页面，不做其它网页操作。",
  inputSchema: zodSchema(
    z.object({
      url: z.string().describe("要打开的 URL（支持 https/http）"),
      title: z.string().optional().describe("可选标题，用于面板显示"),
    })
  ),
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

