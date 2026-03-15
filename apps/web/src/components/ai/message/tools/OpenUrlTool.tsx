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

import * as React from "react";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@openloaf/api/common";
import { cn } from "@/lib/utils";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { createBrowserTabId } from "@/hooks/tab-id";
import { isElectronEnv } from "@/utils/is-electron-env";
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
import { normalizeUrl } from "@/components/browser/browser-utils";

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
  const url = typeof input.url === "string" ? normalizeUrl(input.url) : "";
  const title = typeof input.title === "string" ? input.title : undefined;

  const isError = part.state === 'output-error' || part.state === 'output-denied'
  const errorText = isError && typeof part.errorText === 'string' && part.errorText.trim()
    ? part.errorText
    : undefined
  const isDisabled = !url;

  const onOpen = React.useCallback(() => {
    if (isDisabled) return;
    if (!isElectronEnv()) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    const appView = useAppView.getState();
    const chatSessionId = appView.chatSessionId;
    const baseKey = `browser:${chatSessionId}`;
    const viewKey = `${baseKey}:${createBrowserTabId()}`;
    useLayoutState.getState().pushStackItem(
      {
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        component: BROWSER_WINDOW_COMPONENT,
        params: { __customHeader: true, __open: { url, title, viewKey } },
      } as any,
      70,
    );
  }, [isDisabled, title, url]);

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
        {errorText && (
          <div className="mt-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {errorText}
          </div>
        )}
      </div>
    </div>
  );
}
