import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  type BrowserTab,
  type DockItem,
} from "@tenas-ai/api/common";
import { createBrowserTabId } from "@/hooks/tab-id";

/** Return true when the dock item is a browser panel. */
export function isBrowserWindowItem(item: DockItem | undefined): item is DockItem {
  return Boolean(item && item.component === BROWSER_WINDOW_COMPONENT);
}

/** Collect browser tabs from a dock item. */
export function getBrowserTabs(item: DockItem | undefined): BrowserTab[] {
  if (!item) return [];
  const raw = (item.params as any)?.browserTabs;
  return Array.isArray(raw) ? (raw as BrowserTab[]) : [];
}

/** Get the active browser tab id from a dock item. */
export function getActiveBrowserTabId(item: DockItem | undefined): string | undefined {
  const id = (item?.params as any)?.activeBrowserTabId;
  return typeof id === "string" ? id : undefined;
}

/** Normalize browser dock item data for multi-tab rendering. */
export function normalizeBrowserWindowItem(
  existing: DockItem | undefined,
  incoming: DockItem,
): DockItem {
  const incomingParams = (incoming.params ?? {}) as Record<string, unknown>;
  const existingParams = (existing?.params ?? {}) as Record<string, unknown>;
  const open = incomingParams.__open as
    | { url?: string; title?: string; viewKey?: string }
    | undefined;
  const legacyUrl = typeof incomingParams.url === "string" ? String(incomingParams.url) : "";
  const legacyViewKey =
    typeof incomingParams.viewKey === "string" ? String(incomingParams.viewKey) : "";
  const refreshKey =
    typeof incomingParams.__refreshKey === "number"
      ? (incomingParams.__refreshKey as number)
      : typeof existingParams.__refreshKey === "number"
        ? (existingParams.__refreshKey as number)
        : undefined;
  const customHeader =
    typeof incomingParams.__customHeader === "boolean"
      ? (incomingParams.__customHeader as boolean)
      : typeof existingParams.__customHeader === "boolean"
        ? (existingParams.__customHeader as boolean)
        : undefined;

  const currentTabs = getBrowserTabs(existing);
  const currentActive = getActiveBrowserTabId(existing);

  // 1) params.__open：追加/激活一个浏览器子标签（open-url / agent 事件使用）
  // 2) params.browserTabs：整体覆盖（由 ElectrronBrowserWindow 内部切换/关闭使用）
  const providedTabs = Array.isArray(incomingParams.browserTabs)
    ? (incomingParams.browserTabs as BrowserTab[])
    : undefined;
  const nextTabs = providedTabs ? [...providedTabs] : [...currentTabs];

  let nextActive =
    typeof incomingParams.activeBrowserTabId === "string"
      ? String(incomingParams.activeBrowserTabId)
      : currentActive;

  const openUrl =
    typeof open?.url === "string" ? String(open.url).trim() : "";
  const shouldUseLegacy =
    !openUrl && Boolean(legacyUrl) && !providedTabs && currentTabs.length === 0;
  const resolvedUrl = openUrl || (shouldUseLegacy ? legacyUrl.trim() : "");
  const openViewKey =
    typeof open?.viewKey === "string" ? String(open.viewKey).trim() : "";
  const resolvedViewKey = openViewKey || (shouldUseLegacy ? legacyViewKey.trim() : "");

  if (resolvedUrl) {
    const id = resolvedViewKey || createBrowserTabId();
    const idx = nextTabs.findIndex((t) => String((t as any)?.id ?? "") === id);
    const patch: BrowserTab = {
      id,
      viewKey: resolvedViewKey || id,
      url: resolvedUrl,
      title: typeof open?.title === "string" ? open.title : undefined,
      cdpTargetIds: incomingParams.cdpTargetIds as string[] | undefined,
    };
    if (idx === -1) {
      nextTabs.push(patch);
    } else {
      const existingTab = nextTabs[idx];
      const mergeTargetIds = (base?: string[], next?: string[]) => {
        // 合并目标列表，避免重复写入。
        const set = new Set<string>([...(base ?? []), ...(next ?? [])].filter(Boolean));
        return set.size ? Array.from(set) : undefined;
      };
      nextTabs[idx] = {
        ...existingTab,
        ...patch,
        cdpTargetIds: mergeTargetIds(existingTab?.cdpTargetIds, patch.cdpTargetIds),
      };
    }
    nextActive = id;
  }

  if (!nextActive && nextTabs.length > 0) nextActive = nextTabs[0]!.id;
  if (nextActive && !nextTabs.some((t) => t.id === nextActive)) nextActive = nextTabs[0]?.id;

  const nextParams: Record<string, unknown> = { ...existingParams, ...incomingParams };
  nextParams.browserTabs = nextTabs;
  nextParams.activeBrowserTabId = nextActive;
  if (typeof refreshKey === "number") nextParams.__refreshKey = refreshKey;
  else delete nextParams.__refreshKey;
  if (typeof customHeader === "boolean") nextParams.__customHeader = customHeader;
  else delete nextParams.__customHeader;
  delete nextParams.__open;
  delete nextParams.url;
  delete nextParams.viewKey;
  delete nextParams.cdpTargetIds;

  return {
    ...existing,
    ...incoming,
    id: existing?.id ?? incoming.id ?? BROWSER_WINDOW_PANEL_ID,
    component: BROWSER_WINDOW_COMPONENT,
    sourceKey: existing?.sourceKey ?? incoming.sourceKey ?? BROWSER_WINDOW_PANEL_ID,
    title: existing?.title ?? incoming.title,
    params: nextParams,
  };
}
