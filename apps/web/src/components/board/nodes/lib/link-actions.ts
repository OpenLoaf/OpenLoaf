/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@openloaf/api/common";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { createBrowserTabId } from "@/hooks/tab-id";

/** Build the browser view key for stack entries. */
function buildBrowserViewKey(input: {
  chatSessionId: string;
  browserTabId: string;
}) {
  return `browser:${input.chatSessionId}:${input.browserTabId}`;
}

export type OpenLinkInput = {
  url: string;
  title?: string;
  activeTabId?: string | null;
};

/** Resolve a readable title for a link. */
export function resolveLinkTitle(url: string, title?: string) {
  if (title) return title;
  if (!url) return "Link";
  try {
    return new URL(url).hostname.replace(/^www\\./, "");
  } catch {
    return url;
  }
}

/** Open a link in the current tab stack. */
export function openLinkInStack({ url, title }: OpenLinkInput) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return;
  const resolvedTitle = resolveLinkTitle(trimmedUrl, title);
  const appViewState = useAppView.getState();
  const chatSessionId = appViewState.chatSessionId ?? "unknown";

  const viewKey = buildBrowserViewKey({
    chatSessionId,
    browserTabId: createBrowserTabId(),
  });

  // 逻辑：统一复用浏览器 stack 打开行为，保证多入口一致。
  useLayoutState.getState().pushStackItem(
    {
      component: BROWSER_WINDOW_COMPONENT,
      id: BROWSER_WINDOW_PANEL_ID,
      sourceKey: BROWSER_WINDOW_PANEL_ID,
      params: { __customHeader: true, __open: { url: trimmedUrl, title: resolvedTitle, viewKey } },
    } as any,
    70
  );
}
