import crypto from "node:crypto";
import { tool, zodSchema } from "ai";
import { openUrlToolDef } from "@tenas-ai/api/types/tools/browser";
import { requireTabId } from "@/common/tabContext";
import { getSessionId, getUiWriter, getWorkspaceId } from "@/ai/chat-stream/requestContext";

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

function buildBrowserBaseKey(input: { workspaceId: string; tabId: string; chatSessionId: string }) {
  // baseKey 对应“同一个聊天会话内的浏览器面板”。
  return `browser:${input.workspaceId}:${input.tabId}:${input.chatSessionId}`;
}

/**
 * Opens a URL in the in-app browser panel by emitting a UI data part (MVP).
 */
export const openUrlTool = tool({
  description: openUrlToolDef.description,
  inputSchema: zodSchema(openUrlToolDef.parameters),
  execute: async ({ url, title }) => {
    const writer = getUiWriter();
    if (!writer) throw new Error("UI writer is not available.");

    const workspaceId = getWorkspaceId();
    if (!workspaceId) throw new Error("workspaceId is required.");

    const tabId = requireTabId();
    const chatSessionId = getSessionId();
    if (!chatSessionId) throw new Error("sessionId is required.");

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) throw new Error("url is required.");

    const baseKey = buildBrowserBaseKey({ workspaceId, tabId, chatSessionId });
    const browserTabId = crypto.randomUUID();
    const viewKey = `${baseKey}:${browserTabId}`;
    const panelKey = "browser-window";

    // 通过 data part 让前端在对应 tab 打开浏览器面板；该链路是 V2 的硬约束。
    writer.write({
      type: "data-open-browser",
      data: { tabId, url: normalizedUrl, title, viewKey, panelKey },
    } as any);

    return { ok: true, data: { tabId, url: normalizedUrl, viewKey, panelKey } };
  },
});
