import { tool, zodSchema } from "ai";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import { requireTabId } from "@/common/tabContext";
import { getSessionId, getUiWriter, getWorkspaceId } from "@/common/requestContext";

function normalizeUrl(raw: string): string {
  const value = raw?.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

function buildViewKey(input: { workspaceId: string; tabId: string; chatSessionId: string }) {
  // 中文注释：viewKey 是“逻辑页面标识”，用于前端创建/复用 WebContentsView，并写回 cdpTargetId。
  return `browser:${input.workspaceId}:${input.tabId}:${input.chatSessionId}`;
}

/**
 * open-url tool (MVP): emit a UI data part to open an Electron browser panel.
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

    const viewKey = buildViewKey({ workspaceId, tabId, chatSessionId });
    const panelKey = viewKey;

    // 中文注释：通过 data part 让前端在对应 tab 的 stack 打开浏览面板。
    writer.write({
      type: "data-open-browser",
      data: { tabId, url: normalizedUrl, title, viewKey, panelKey },
    } as any);

    return { ok: true, data: { tabId, url: normalizedUrl, viewKey, panelKey } };
  },
});

