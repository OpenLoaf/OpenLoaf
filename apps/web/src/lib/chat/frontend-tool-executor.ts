/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@openloaf/api/common";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { createBrowserTabId } from "@/hooks/tab-id";
import { resolveServerUrl } from "@/utils/server-url";
import { ensureAddonInstalled, invokeWpsOpen } from "@/lib/wps/wps-rpc";
import { isElectronEnv } from "@/utils/is-electron-env";
import { useTabs } from "@/hooks/use-tabs";
import { queryClient } from "@/utils/trpc";
import { getProjectsQueryKey } from "@/hooks/use-projects";
import { buildProjectHierarchyIndex } from "@/lib/project-tree";
import { getRelativePathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { createFileEntryFromUri } from "@/components/file/lib/open-file";
import { recordRecentOpen } from "@/components/file/lib/recent-open";
import { waitForWebContentsViewReady } from "@/lib/chat/open-url-ack";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import type { FileSystemEntry } from "@/components/project/filesystem/utils/file-system-utils";

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
  executeFromToolCall: (input: { toolCall: any; tabId?: string }) => Promise<boolean>;
};

function resolveAckEndpoint(): string {
  const baseUrl = resolveServerUrl();
  return baseUrl ? `${baseUrl}/ai/tools/ack` : "/ai/tools/ack";
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

/** Resolve file entry context from a file:// url. */
function resolveFileEntryFromUrl(input: {
  url: string;
  tabId?: string;
}): { entry: FileSystemEntry; workspaceId: string; projectId: string } | null {
  if (!input.tabId) return null;
  if (!input.url.startsWith("file://")) return null;

  const tab = useTabs.getState().getTabById(input.tabId);
  if (!tab?.workspaceId) return null;
  const projectId =
    typeof tab.chatParams?.projectId === "string" ? tab.chatParams.projectId : null;
  if (!projectId) return null;

  const projects =
    (queryClient.getQueryData(getProjectsQueryKey()) as ProjectNode[] | undefined) ?? [];
  if (!projects.length) return null;

  const projectHierarchy = buildProjectHierarchyIndex(projects);
  const rootUri = projectHierarchy.rootUriById.get(projectId);
  if (!rootUri) return null;

  // 逻辑：open-url 的 file:// url 需要映射回项目内相对路径。
  const relativeUri = getRelativePathFromUri(rootUri, input.url);
  if (!relativeUri) return null;

  const entry = createFileEntryFromUri({ uri: relativeUri });
  if (!entry) return null;

  return {
    entry,
    workspaceId: tab.workspaceId,
    projectId,
  };
}

async function postFrontendToolAck(payload: FrontendToolAckPayload): Promise<void> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 100;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(resolveAckEndpoint(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (response.ok) return;

      const text = await response.text().catch(() => "");
      // 中文注释：前端回执失败时打印日志，方便排查执行链路是否到达服务端。
      console.warn("[frontend-tool] ack failed", {
        status: response.status,
        text,
        toolCallId: payload.toolCallId,
        attempt,
      });

      // 逻辑：5xx 错误才重试，4xx 错误直接放弃（客户端参数问题重试无意义）。
      if (response.status < 500 || attempt >= MAX_RETRIES) return;
    } catch (err) {
      console.warn("[frontend-tool] ack network error", {
        toolCallId: payload.toolCallId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt >= MAX_RETRIES) return;
    }

    // 指数退避：100ms → 300ms → 900ms
    const delay = BASE_DELAY_MS * 3 ** attempt;
    await new Promise((r) => setTimeout(r, delay));
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
  // 逻辑：仅允许白名单工具进入执行路径，避免误处理审批类 tool。
  const allowedToolNames = new Set<string>();

  const execute = async (input: {
    toolCallId: string;
    toolName: string;
    payload: unknown;
    tabId?: string;
  }): Promise<boolean> => {
    const toolCallId = input.toolCallId.trim();
    const toolName = input.toolName.trim();
    if (!toolCallId || !toolName) return false;
    if (!allowedToolNames.has(toolName)) return false;
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
      allowedToolNames.add(toolName);
    },
    executeFromDataPart: async ({ dataPart, tabId }) => {
      if (dataPart?.type !== "tool-input-available") return false;
      const toolCallId = typeof dataPart.toolCallId === "string" ? dataPart.toolCallId : "";
      const toolName = typeof dataPart.toolName === "string" ? dataPart.toolName : "";
      if (!toolCallId || !toolName) return false;
      return execute({ toolCallId, toolName, payload: dataPart.input, tabId });
    },
    executeFromToolCall: async ({ toolCall, tabId }) => {
      const toolCallId = typeof toolCall?.toolCallId === "string" ? toolCall.toolCallId : "";
      const toolName = typeof toolCall?.toolName === "string" ? toolCall.toolName : "";
      if (!toolCallId || !toolName) return false;
      if (toolCall?.invalid === true) return false;
      return execute({ toolCallId, toolName, payload: toolCall.input, tabId });
    },
    executeFromToolPart: async ({ part, tabId }) => {
      const toolCallId = typeof part?.toolCallId === "string" ? part.toolCallId : "";
      const toolName = resolveToolName(part);
      if (!toolCallId || !toolName) return false;
      if (part?.output != null || (typeof part?.errorText === "string" && part.errorText.trim())) {
        return false;
      }
      if (part?.input == null) return false;
      // 逻辑：仅在 input 完整时（input-available）才执行前端工具。
      // input-streaming 状态下 input 可能不完整（如缺少 url），会导致误报 "url is required."。
      const state = typeof part?.state === "string" ? part.state : "";
      if (state === "input-streaming") return false;
      return execute({ toolCallId, toolName, payload: part.input, tabId });
    },
  };
}

type OpenUrlInput = {
  url?: string;
  title?: string;
};

type OfficeExecuteInput = {
  appType?: "docx" | "excel" | "ppt";
  action?: string;
  payload?: {
    filePath?: string;
  };
  workspaceId?: string;
  projectId?: string;
};

/** Register builtin frontend tool handlers. */
export function registerDefaultFrontendToolHandlers(executor: FrontendToolExecutor) {
  executor.register("open-url", async ({ input, tabId }) => {
    const rawUrl = (input as OpenUrlInput)?.url;
    const url = typeof rawUrl === "string" ? rawUrl : "";
    const title = typeof (input as OpenUrlInput)?.title === "string"
      ? (input as OpenUrlInput).title
      : undefined;
    const normalizedUrl = normalizeUrl(url);

    if (!tabId) {
      console.warn("[frontend-tool] open-url missing tabId");
      return { status: "failed", errorText: "tabId is required." };
    }
    if (!normalizedUrl) {
      // 逻辑：记录原始 input，方便排查子代理传参缺失的问题。
      console.warn("[frontend-tool] open-url missing url", {
        input,
        rawUrl: url,
      });
      // 逻辑：console 对象可能被覆盖，追加字符串化输出保证可见。
      console.warn(
        "[frontend-tool] open-url missing url payload",
        JSON.stringify({ input, rawUrl: url }),
      );
      return { status: "failed", errorText: "url is required." };
    }

    // 逻辑：非 Electron 环境直接打开新标签页，不走内置浏览器面板。
    if (!isElectronEnv()) {
      window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
      return { status: "success", output: { url: normalizedUrl } }
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

    const recent = resolveFileEntryFromUrl({ url: normalizedUrl, tabId });
    if (recent) {
      recordRecentOpen({
        workspaceId: recent.workspaceId,
        projectId: recent.projectId,
        entry: recent.entry,
      });
    }

    const readyResult = await waitForWebContentsViewReady(viewKey);
    if (readyResult?.status === "failed") {
      const failed = readyResult.detail.failed;
      return {
        status: "failed",
        output: { url: normalizedUrl, viewKey },
        errorText: failed?.errorDescription || "open-url failed",
      };
    }

    return { status: "success", output: { url: normalizedUrl, viewKey } };
  });

  executor.register("office-execute", async ({ input, tabId }) => {
    const raw = (input || {}) as OfficeExecuteInput;
    const appType =
      typeof raw.appType === "string" && raw.appType.trim() ? raw.appType.trim() : "docx";

    if (appType !== "docx") {
      return { status: "failed", errorText: "office-execute only supports docx addin." };
    }

    const payload = raw.payload ?? {};
    const filePath =
      typeof payload.filePath === "string" && payload.filePath.trim()
        ? payload.filePath.trim()
        : undefined;

    const tab = tabId ? useTabs.getState().getTabById(tabId) : null;
    const workspaceId =
      typeof raw.workspaceId === "string" && raw.workspaceId.trim()
        ? raw.workspaceId.trim()
        : tab?.workspaceId;
    const projectId =
      typeof raw.projectId === "string" && raw.projectId.trim()
        ? raw.projectId.trim()
        : typeof tab?.chatParams?.projectId === "string"
          ? tab.chatParams.projectId
          : undefined;

    let serverUrl = resolveServerUrl();
    if (!serverUrl && typeof window !== "undefined") {
      serverUrl = window.location.origin;
    }
    if (!serverUrl) {
      return { status: "failed", errorText: "serverUrl is required." };
    }

    const baseUrl = serverUrl.replace(/\/$/, "");
    const addinUrl = `${baseUrl}/wps-addins/docx/`;
    const addonName = "HelloWps";
    const addonType = "wps";

    await ensureAddonInstalled({
      name: addonName,
      addonType,
      online: "true",
      url: addinUrl,
    });

    await invokeWpsOpen({
      addonType,
      addonName,
      funcName: "openFileFromOpenLoaf",
      payload: {
        filePath,
        serverUrl: baseUrl,
        workspaceId,
        projectId,
      },
    });

    return { status: "success", output: { appType, filePath, addinUrl } };
  });
}