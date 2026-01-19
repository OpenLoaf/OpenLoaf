"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { createBrowserTabId } from "@/hooks/tab-id";
import { useChatContext } from "@/components/chat/ChatProvider";
import ToolInfoCard from "./shared/ToolInfoCard";
import {
  getToolName,
  getToolStatusText,
  getToolStatusTone,
  safeStringify,
} from "./shared/tool-utils";

type AnyToolPart = {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function getInputUrl(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const url = (input as any).url;
  return typeof url === "string" ? url.trim() : "";
}

function getInputTitle(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const title = (input as any).title;
  return typeof title === "string" && title.trim() ? title.trim() : undefined;
}

function isToolFinished(part: AnyToolPart) {
  if (typeof part.errorText === "string" && part.errorText.trim()) return true;
  if (part.state === "output-available") return true;
  if (part.output != null) return true;
  return false;
}

function buildViewKey(input: { workspaceId: string; tabId: string; chatSessionId: string }) {
  // baseKey 用于定位“浏览器面板”，实际每个网页子标签用 baseKey + browserTabId 区分。
  return `browser:${input.workspaceId}:${input.tabId}:${input.chatSessionId}`;
}

/**
 * OpenUrlTool renders a "manual open" button after the tool stream finishes.
 */
export function OpenUrlTool({ part }: { part: AnyToolPart }) {
  const { tabId: contextTabId } = useChatContext();
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabId = contextTabId ?? activeTabId ?? undefined;

  const url = getInputUrl(part.input);
  const title = getInputTitle(part.input);
  const finished = isToolFinished(part);
  const hasError = typeof part.errorText === "string" && part.errorText.trim().length > 0;

  const statusText = getToolStatusText(part as any);
  const statusTone = getToolStatusTone(part as any);

  const onOpen = React.useCallback(() => {
    if (!tabId) return;
    if (!url) return;
    if (!finished) return;
    if (hasError) return;

    const state = useTabs.getState();
    const tab = state.getTabById(tabId);
    if (!tab) return;

    const baseKey = buildViewKey({
      workspaceId: tab.workspaceId,
      tabId,
      chatSessionId: tab.chatSessionId,
    });
    const viewKey = `${baseKey}:${createBrowserTabId()}`;

    // 写入 stack，由 ElectrronBrowserWindow 负责 ensureWebContentsView 并写回 cdpTargetIds。
    state.pushStackItem(
      tabId,
      {
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        component: BROWSER_WINDOW_COMPONENT,
        params: { __customHeader: true, __open: { url, title, viewKey } },
      } as any,
      100,
    );
  }, [tabId, url, finished, hasError, title]);

  return (
    <ToolInfoCard
      title={getToolName(part as any)}
      action="打开网页"
      status={statusText}
      statusTone={statusTone}
      params={[
        { label: "地址", value: url || "—", mono: true },
        { label: "标题", value: title ?? "—" },
      ]}
      actions={
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!finished || hasError || !url || !tabId}
          onClick={onOpen}
        >
          打开
        </Button>
      }
      output={{
        title: "结果",
        summaryRows: [
          {
            label: "状态",
            value: hasError ? "失败" : finished ? "已准备打开" : "执行中",
            tone: hasError ? "danger" : "muted",
          },
        ],
        rawText: hasError ? String(part.errorText ?? "") : safeStringify(part.output),
        tone: hasError ? "error" : "default",
        defaultOpen: hasError,
      }}
    />
  );
}
