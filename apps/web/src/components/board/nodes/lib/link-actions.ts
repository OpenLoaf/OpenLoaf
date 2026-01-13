import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID, useTabs } from "@/hooks/use-tabs";

/** Create a unique browser sub-tab id. */
function createBrowserTabId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Build the browser view key for stack entries. */
function buildBrowserViewKey(input: {
  workspaceId: string;
  tabId: string;
  chatSessionId: string;
  browserTabId: string;
}) {
  return `browser:${input.workspaceId}:${input.tabId}:${input.chatSessionId}:${input.browserTabId}`;
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
export function openLinkInStack({ url, title, activeTabId }: OpenLinkInput) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return;
  const resolvedTitle = resolveLinkTitle(trimmedUrl, title);
  const state = useTabs.getState();
  const tabId = activeTabId ?? state.activeTabId;
  if (!tabId) return;
  const tab = state.getTabById(tabId);
  if (!tab) return;

  const viewKey = buildBrowserViewKey({
    workspaceId: tab.workspaceId ?? "unknown",
    tabId,
    chatSessionId: tab.chatSessionId ?? "unknown",
    browserTabId: createBrowserTabId(),
  });

  // 逻辑：统一复用浏览器 stack 打开行为，保证多入口一致。
  state.pushStackItem(
    tabId,
    {
      component: BROWSER_WINDOW_COMPONENT,
      id: BROWSER_WINDOW_PANEL_ID,
      sourceKey: BROWSER_WINDOW_PANEL_ID,
      params: { __customHeader: true, __open: { url: trimmedUrl, title: resolvedTitle, viewKey } },
    } as any,
    100
  );
}
