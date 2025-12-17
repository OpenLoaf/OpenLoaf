import type { DockItem } from "@teatime-ai/api/common";
import { tool, zodSchema } from "ai";
import { emitUiEvent, requireActiveTab } from "@/chat/ui/emit";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import { uiEvents } from "@teatime-ai/api/types/event";
import { registerPageTarget } from "./pageTargets";

// ==========
// MVP：浏览器能力（通过 UI 事件驱动前端打开 BrowserWindow）
// ==========

function normalizeUrl(raw: string): string {
  const value = raw?.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

function buildBrowserWindowDockItem({
  url,
  title,
  pageTargetId,
}: {
  url: string;
  title?: string;
  pageTargetId: string;
}): DockItem {
  return {
    id: `browser-window:${pageTargetId}`,
    sourceKey: `browser-window:${pageTargetId}`,
    component: "electron-browser-window",
    title: title ?? "Browser Window",
    params: { url, autoOpen: true, pageTargetId },
  };
}

export const openUrlTool = tool({
  description: openUrlToolDef.description,
  inputSchema: zodSchema(openUrlToolDef.parameters),
  execute: async ({ url, title, pageTargetId }) => {
    const activeTab = requireActiveTab();
    const normalizedUrl = normalizeUrl(url);
    const record = registerPageTarget({
      pageTargetId,
      tabId: activeTab.id,
      url: normalizedUrl,
    });
    // 统一通过 uiEvents 生成事件，避免业务侧手写 kind/字段。
    emitUiEvent(
      uiEvents.pushStackItem({
        tabId: activeTab.id,
        item: buildBrowserWindowDockItem({
          url: normalizedUrl,
          title,
          pageTargetId,
        }),
      }),
    );
    return { ok: true, data: { pageTargetId: record.pageTargetId } };
  },
});
