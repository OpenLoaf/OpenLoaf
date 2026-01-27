"use client";

import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@tenas-ai/api/common";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
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
  executeFromToolPart: (input: { part: any; tabId?: string }) => Promise<boolean>;
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
  const response = await fetch(ACK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // 中文注释：前端回执失败时打印日志，方便排查执行链路是否到达服务端。
    console.warn("[frontend-tool] ack failed", {
      status: response.status,
      text,
      toolCallId: payload.toolCallId,
    });
  }
}

function resolveToolName(part: any): string {
  if (typeof part?.toolName === "string" && part.toolName.trim()) return part.toolName.trim();
  if (typeof part?.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return "";
}

function markToolStreaming(input: { tabId?: string; toolCallId: string }) {
  if (!input.tabId) return;
  const state = useChatRuntime.getState();
  const current = state.toolPartsByTabId[input.tabId]?.[input.toolCallId];
  state.upsertToolPart(input.tabId, input.toolCallId, {
    ...current,
    state: "output-streaming",
    streaming: true,
  } as any);
}

/** Create a frontend tool executor with a local handler registry. */
export function createFrontendToolExecutor(): FrontendToolExecutor {
  const handlers = new Map<string, FrontendToolHandler>();
  const executed = new Set<string>();

  const execute = async (input: {
    toolCallId: string;
    toolName: string;
    payload: unknown;
    tabId?: string;
  }): Promise<boolean> => {
    const toolCallId = input.toolCallId.trim();
    const toolName = input.toolName.trim();
    if (!toolCallId || !toolName) return false;
    const handler = handlers.get(toolName);
    if (!handler) {
      console.warn("[frontend-tool] no handler for tool", { toolCallId, toolName });
      return false;
    }
    // 中文注释：每个 toolCallId 只执行一次，避免重复打开 UI 或重复回执。
    if (executed.has(toolCallId)) return false;
    executed.add(toolCallId);

    const requestedAt = new Date().toISOString();
    markToolStreaming({ tabId: input.tabId, toolCallId });
    try {
      const result = await handler({
        toolCallId,
        toolName,
        input: input.payload,
        tabId: input.tabId,
      });
      await postFrontendToolAck({
        toolCallId,
        status: result.status,
        output: result.output,
        errorText: result.errorText ?? null,
        requestedAt,
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      console.warn("[frontend-tool] execute error", { toolCallId, toolName, errorText });
      await postFrontendToolAck({
        toolCallId,
        status: "failed",
        errorText,
        requestedAt,
      });
    }
    return true;
  };

  return {
    register: (toolName, handler) => {
      handlers.set(toolName, handler);
    },
    executeFromDataPart: async ({ dataPart, tabId }) => {
      if (dataPart?.type !== "tool-input-available") return false;
      const toolCallId = typeof dataPart.toolCallId === "string" ? dataPart.toolCallId : "";
      const toolName = typeof dataPart.toolName === "string" ? dataPart.toolName : "";
      if (!toolCallId || !toolName) return false;
      return execute({ toolCallId, toolName, payload: dataPart.input, tabId });
    },
    executeFromToolPart: async ({ part, tabId }) => {
      const toolCallId = typeof part?.toolCallId === "string" ? part.toolCallId : "";
      const toolName = resolveToolName(part);
      if (!toolCallId || !toolName) return false;
      if (part?.output != null || (typeof part?.errorText === "string" && part.errorText.trim())) {
        return false;
      }
      if (part?.input == null) return false;
      return execute({ toolCallId, toolName, payload: part.input, tabId });
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
      console.warn("[frontend-tool] open-url missing tabId");
      return { status: "failed", errorText: "tabId is required." };
    }
    if (!normalizedUrl) {
      console.warn("[frontend-tool] open-url missing url");
      return { status: "failed", errorText: "url is required." };
    }

    const viewKey = createBrowserTabId();
    useTabRuntime.getState().pushStackItem(
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
