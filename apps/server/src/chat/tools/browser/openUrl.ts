import { tool, zodSchema } from "ai";
import { requireTabId } from "@/chat/ui/tabContext";
import { requestContextManager } from "@/context/requestContext";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import { browserRuntimeHub } from "@/runtime/browserRuntimeHub";
import { registerPageTarget, updatePageTargetRuntimeInfo } from "./pageTargets";

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

export const openUrlTool = tool({
  description: openUrlToolDef.description,
  inputSchema: zodSchema(openUrlToolDef.parameters),
  execute: async ({ url, title, pageTargetId }) => {
    const tabId = requireTabId();
    const normalizedUrl = normalizeUrl(url);

    const appId = requestContextManager.getAppId();
    if (!appId) {
      throw new Error("open-url 需要 Electron 客户端（缺少 appId）。");
    }
    if (!browserRuntimeHub.hasElectronRuntime(appId)) {
      throw new Error(
        `open-url 需要 Electron runtime 在线（appId=${appId} 未连接 /runtime-ws）。`,
      );
    }

    // 统一走 “server 调度 -> runtime 执行 -> IPC 触发 UI” 的一段式流程。
    registerPageTarget({
      pageTargetId,
      tabId,
      url: normalizedUrl,
      backend: "electron",
      appId,
    });

    const result = await browserRuntimeHub.openPageOnElectron({
      appId,
      pageTargetId,
      url: normalizedUrl,
      tabId,
      title,
    });

    if (!result.cdpTargetId) {
      throw new Error("open-url 失败：runtime 未返回 cdpTargetId。");
    }

    updatePageTargetRuntimeInfo(pageTargetId, {
      backend: "electron",
      appId,
      cdpTargetId: result.cdpTargetId,
      webContentsId: result.webContentsId,
    });

    return { ok: true, data: { pageTargetId, cdpTargetId: result.cdpTargetId } };
  },
});
