"use client";

import * as React from "react";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@tenas-ai/api/common";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { createBrowserTabId } from "@/hooks/tab-id";
import { useChatSession } from "../../context";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  asPlainObject,
  getToolName,
  normalizeToolInput,
  type AnyToolPart,
} from "./shared/tool-utils";

type OpenUrlParams = {
  actionName?: string;
  url?: string;
  title?: string;
};

function getInputObject(part: AnyToolPart): OpenUrlParams {
  return (asPlainObject(normalizeToolInput(part.input)) ?? {}) as OpenUrlParams;
}

export default function OpenUrlTool({
  part,
  className,
}: {
  part: AnyToolPart;
  className?: string;
}) {
  const input = getInputObject(part);
  const actionName =
    typeof input.actionName === "string" && input.actionName.trim()
      ? input.actionName
      : getToolName(part);
  const url = typeof input.url === "string" ? input.url : "";
  const title = typeof input.title === "string" ? input.title : undefined;

  const { tabId: contextTabId } = useChatSession();
  const activeTabId = useTabs((s) => s.activeTabId);
  const tabId = contextTabId ?? activeTabId ?? undefined;

  const isDisabled = !tabId || !url;

  const onOpen = React.useCallback(() => {
    if (isDisabled) return;
    const state = useTabs.getState();
    const tab = state.getTabById(tabId);
    if (!tab) return;
    const baseKey = `browser:${tab.workspaceId}:${tabId}:${tab.chatSessionId}`;
    const viewKey = `${baseKey}:${createBrowserTabId()}`;
    useTabRuntime.getState().pushStackItem(
      tabId,
      {
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        component: BROWSER_WINDOW_COMPONENT,
        params: { __customHeader: true, __open: { url, title, viewKey } },
      } as any,
      100,
    );
  }, [isDisabled, tabId, title, url]);

  return (
    <div className={cn("flex w-full min-w-0 max-w-full justify-start", className)}>
      <div className="w-full min-w-0 max-w-[90%]">
        <Sources className="mb-0 text-xs">
          <SourcesTrigger count={1}>
            <p className="font-medium">{actionName}</p>
          </SourcesTrigger>
          <SourcesContent className="w-full">
            <Source
              href={url || "#"}
              title={title || url || actionName}
              className={cn(
                "w-full min-w-0 text-[11px] text-muted-foreground underline-offset-2",
                isDisabled ? "pointer-events-none opacity-60" : "hover:underline",
              )}
              onClick={(event) => {
                event.preventDefault();
                if (isDisabled) return;
                onOpen();
              }}
            >
              <span className="truncate">{title || url || "-"}</span>
            </Source>
          </SourcesContent>
        </Sources>
      </div>
    </div>
  );
}
