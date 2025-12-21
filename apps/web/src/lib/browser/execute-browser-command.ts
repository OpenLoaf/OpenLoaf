"use client";

import type { TeatimeUIDataTypes } from "@teatime-ai/api/types/message";

/**
 * Execute a server-issued browser command via Electron bridge.
 */
export async function executeBrowserCommand(input: {
  payload: TeatimeUIDataTypes["browser-command"];
}) {
  const api = window.teatimeElectron;
  if (!api?.runBrowserCommand) {
    throw new Error("Electron API runBrowserCommand is not available.");
  }

  // 中文注释：实际浏览器控制发生在 Electron 主进程/automation 层，Web 仅负责转发与回传结果。
  return await api.runBrowserCommand({
    commandId: input.payload.commandId,
    tabId: input.payload.tabId,
    viewKey: input.payload.viewKey,
    cdpTargetId: input.payload.cdpTargetId,
    command: input.payload.command,
  });
}

