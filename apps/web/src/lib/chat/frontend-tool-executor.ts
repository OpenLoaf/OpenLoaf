"use client";

import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { createBrowserTabId } from "@/hooks/tab-id";

export type FrontendToolAckStatus = "success" | "failed" | "timeout";

export type FrontendToolAckPayload = {
  toolCallId: string;
  status: FrontendToolAckStatus;
  output?: unknown;
  errorText?: string | null;
  requestedAt: string;
};

export type FrontendToolHandlerResult = {
  status: FrontendToolAckStatus;
  output?: unknown;
  errorText?: string | null;
};

export type FrontendToolHandlerContext = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  tabId?: string;
};

export type FrontendToolHandler = (
  context: FrontendToolHandlerContext,
) => Promise<FrontendToolHandlerResult>;

export type FrontendToolExecutor = {
  register: (toolName: string, handler: FrontendToolHandler) => void;
  executeFromDataPart: (input: { dataPart: any; tabId?: string }) => Promise<boolean>;
};

const ACK_ENDPOINT = "/ai/tools/ack";

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

async function postFrontendToolAck(payload: FrontendToolAckPayload): Promise<void> {
  await fetch(ACK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
}

/** Create a frontend tool executor with a local handler registry. */
export function createFrontendToolExecutor(): FrontendToolExecutor {
  const handlers = new Map<string, FrontendToolHandler>();
  const executed = new Set<string>();

  return {
    register: (toolName, handler) => {
      handlers.set(toolName, handler);
    },
    executeFromDataPart: async ({ dataPart, tabId }) => {
      if (dataPart?.type !== "tool-input-available") return false;
      const toolCallId = typeof dataPart.toolCallId === "string" ? dataPart.toolCallId : "";
      const toolName = typeof dataPart.toolName === "string" ? dataPart.toolName : "";
      if (!toolCallId || !toolName) return false;
      const handler = handlers.get(toolName);
      if (!handler) return false;
      // 中文注释：每个 toolCallId 只执行一次，避免重复打开 UI 或重复回执。
      if (executed.has(toolCallId)) return false;
      executed.add(toolCallId);

      const requestedAt = new Date().toISOString();
      try {
        const result = await handler({ toolCallId, toolName, input: dataPart.input, tabId });
        await postFrontendToolAck({
          toolCallId,
          status: result.status,
          output: result.output,
          errorText: result.errorText ?? null,
          requestedAt,
        });
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        await postFrontendToolAck({
          toolCallId,
          status: "failed",
          errorText,
          requestedAt,
        });
      }
      return true;
    },
  };
}

type OpenUrlInput = {
  url?: string;
  title?: string;
};

/** Register builtin frontend tool handlers. */
export function registerDefaultFrontendToolHandlers(executor: FrontendToolExecutor) {
  executor.register("open-url", async ({ input, tabId }) => {
    const url = typeof (input as OpenUrlInput)?.url === "string"
      ? (input as OpenUrlInput).url
      : "";
    const title = typeof (input as OpenUrlInput)?.title === "string"
      ? (input as OpenUrlInput).title
      : undefined;
    const normalizedUrl = normalizeUrl(url);

    if (!tabId) {
      return { status: "failed", errorText: "tabId is required." };
    }
    if (!normalizedUrl) {
      return { status: "failed", errorText: "url is required." };
    }

    const viewKey = createBrowserTabId();
    useTabs.getState().pushStackItem(
      tabId,
      {
        component: BROWSER_WINDOW_COMPONENT,
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        params: { __customHeader: true, __open: { url: normalizedUrl, title, viewKey } },
      } as any,
      100,
    );

    return { status: "success", output: { url: normalizedUrl, viewKey } };
  });
}
