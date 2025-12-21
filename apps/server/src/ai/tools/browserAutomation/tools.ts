import { tool, zodSchema } from "ai";
import crypto from "node:crypto";
import type { TeatimeUIDataTypes } from "@teatime-ai/api/types/message";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@teatime-ai/api/types/tools/browserAutomation";
import { requireTabId } from "@/common/tabContext";
import {
  getAbortSignal,
  getClientId,
  getSessionId,
  getUiWriter,
} from "@/common/requestContext";
import { tabSnapshotStore } from "@/modules/tab/TabSnapshotStoreAdapter";
import { createBrowserCommandPending } from "@/modules/tab/BrowserCommandStoreAdapter";

type BrowserTarget = {
  tabId: string;
  viewKey: string;
  cdpTargetId?: string;
};

/**
 * Sleep for a short period (supports cooperative cancellation).
 */
function sleep(ms: number, signal?: AbortSignal) {
  // 中文注释：工具等待期间支持协作式中断（stop generating）。
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Resolve the currently active browser target from the latest Tab snapshot.
 */
async function resolveActiveBrowserTarget(opts: { timeoutMs: number }): Promise<BrowserTarget> {
  const sessionId = getSessionId();
  const clientId = getClientId();
  const tabId = requireTabId();
  if (!sessionId || !clientId) throw new Error("sessionId/clientId is required.");

  const abortSignal = getAbortSignal();
  const start = Date.now();

  while (true) {
    const tab = tabSnapshotStore.get({ sessionId, clientId, tabId });
    const stack = Array.isArray(tab?.stack) ? tab!.stack : [];
    const browserItem = stack.find((i: any) => i?.component === "electron-browser-window");
    const tabs = (browserItem?.params as any)?.browserTabs;
    const activeId = (browserItem?.params as any)?.activeBrowserTabId;

    if (Array.isArray(tabs) && tabs.length > 0) {
      const active =
        tabs.find((t: any) => String(t?.id ?? "") === String(activeId ?? "")) ??
        tabs[0];
      const viewKey = String(active?.viewKey ?? active?.id ?? "");
      const cdpTargetId = typeof active?.cdpTargetId === "string" ? active.cdpTargetId : undefined;
      if (viewKey) return { tabId, viewKey, cdpTargetId };
    }

    if (Date.now() - start >= opts.timeoutMs) {
      throw new Error("未找到可用的浏览器页面：请先使用 open-url 打开页面。");
    }
    await sleep(120, abortSignal);
  }
}

/**
 * Emit a browser command to the renderer (Electron) and await its result.
 */
async function emitBrowserCommandAndWait(input: {
  command: TeatimeUIDataTypes["browser-command"]["command"];
  timeoutMs: number;
}) {
  const writer = getUiWriter();
  if (!writer) throw new Error("UI writer is not available.");

  const commandId = crypto.randomUUID();
  const target = await resolveActiveBrowserTarget({ timeoutMs: input.timeoutMs });

  const payload: TeatimeUIDataTypes["browser-command"] = {
    commandId,
    tabId: target.tabId,
    viewKey: target.viewKey,
    cdpTargetId: target.cdpTargetId,
    command: input.command,
  };

  const pending = createBrowserCommandPending({ commandId });

  // 中文注释：通过 SSE data part 下发给前端，前端再转发给 Electron 执行，完成后回调 reportBrowserCommandResult。
  writer.write({ type: "data-browser-command", data: payload } as any);

  const abortSignal = getAbortSignal();
  const timeoutMs = Math.max(0, Math.min(120_000, input.timeoutMs));

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error("browser command timeout")), timeoutMs);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

  return await Promise.race([pending, timeoutPromise]);
}

export const browserSnapshotTool = tool({
  description: browserSnapshotToolDef.description,
  inputSchema: zodSchema(browserSnapshotToolDef.parameters),
  execute: async (input) => {
    const result = await emitBrowserCommandAndWait({
      command: { kind: "snapshot", input: { verbose: input.verbose === true } },
      timeoutMs: 15_000,
    });
    return result as any;
  },
});

export const browserActTool = tool({
  description: browserActToolDef.description,
  inputSchema: zodSchema(browserActToolDef.parameters),
  execute: async (input) => {
    const result = await emitBrowserCommandAndWait({
      command: { kind: "act", input: { action: input.action, timeoutMs: input.timeoutMs } },
      timeoutMs: input.timeoutMs ?? 45_000,
    });
    return result as any;
  },
});

export const browserObserveTool = tool({
  description: browserObserveToolDef.description,
  inputSchema: zodSchema(browserObserveToolDef.parameters),
  execute: async (input) => {
    const result = await emitBrowserCommandAndWait({
      command: { kind: "observe", input: { instruction: input.instruction, timeoutMs: input.timeoutMs } },
      timeoutMs: input.timeoutMs ?? 45_000,
    });
    return result as any;
  },
});

export const browserExtractTool = tool({
  description: browserExtractToolDef.description,
  inputSchema: zodSchema(browserExtractToolDef.parameters),
  execute: async (input) => {
    const result = await emitBrowserCommandAndWait({
      command: { kind: "extract", input: { instruction: input.instruction, timeoutMs: input.timeoutMs } },
      timeoutMs: input.timeoutMs ?? 60_000,
    });
    return result as any;
  },
});

export const browserWaitTool = tool({
  description: browserWaitToolDef.description,
  inputSchema: zodSchema(browserWaitToolDef.parameters),
  execute: async (input) => {
    const result = await emitBrowserCommandAndWait({
      command: { kind: "wait", input: { type: input.type, url: input.url, text: input.text, timeoutMs: input.timeoutMs } },
      timeoutMs: input.timeoutMs ?? 30_000,
    });
    return result as any;
  },
});

export const browserAutomationTools = {
  [browserSnapshotToolDef.id]: browserSnapshotTool,
  [browserActToolDef.id]: browserActTool,
  [browserObserveToolDef.id]: browserObserveTool,
  [browserExtractToolDef.id]: browserExtractTool,
  [browserWaitToolDef.id]: browserWaitTool,
} as const;
