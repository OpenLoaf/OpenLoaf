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
import { GlobeIcon, ExternalLinkIcon } from "lucide-react";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@openloaf/api/common";
import { cn } from "@/lib/utils";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { createBrowserTabId } from "@/hooks/tab-id";
import { isElectronEnv } from "@/utils/is-electron-env";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip";
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

  const displayText = title || url || "-";

  return (
    <div className={cn("min-w-0 text-xs", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-1.5 rounded-full px-2.5 py-1",
              "transition-colors duration-150",
              isDisabled
                ? "cursor-default opacity-60"
                : "hover:bg-muted/60",
            )}
            onClick={onOpen}
            disabled={isDisabled}
          >
            <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{actionName}</span>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
              {displayText}
            </span>
            {!isDisabled && (
              <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground/40" />
            )}
          </button>
        </TooltipTrigger>
        {url ? (
          <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap font-mono text-xs">
            {url}
          </TooltipContent>
        ) : null}
      </Tooltip>
      {errorText && (
        <div className="ml-2.5 mt-1 whitespace-pre-wrap break-all rounded-2xl bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {errorText}
        </div>
      )}
    </div>
  );
}
