"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  useTabs,
} from "@/hooks/use-tabs";
import { useChatContext } from "@/components/chat/ChatProvider";
import { Globe } from "lucide-react";

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

function createBrowserTabId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
    <div className="flex ml-2 w-full min-w-0 max-w-full justify-start">
      <Card className="w-full min-w-0 max-w-[520px] py-2 shadow-none mr-6">
        <CardContent className="px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="shrink-0 text-muted-foreground">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-foreground/90">
                {title ?? "—"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                    title={url}
                  >
                    {url}
                  </a>
                ) : (
                  "—"
                )}
              </div>
              {hasError ? (
                <div className="mt-1 truncate text-xs text-destructive">
                  {String(part.errorText)}
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!finished || hasError || !url || !tabId}
              onClick={onOpen}
            >
              打开
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
