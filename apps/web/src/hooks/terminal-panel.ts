/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
  type DockItem,
  type TerminalTab,
} from "@openloaf/api/common";
import { createTerminalTabId } from "@/hooks/tab-id";

/** Return true when the dock item is a terminal panel. */
export function isTerminalWindowItem(item: DockItem | undefined): item is DockItem {
  return Boolean(item && item.component === TERMINAL_WINDOW_COMPONENT);
}

/** Normalize a terminal tab definition. */
export function normalizeTerminalTab(tab: TerminalTab): TerminalTab {
  const component =
    typeof tab.component === "string" && tab.component.trim()
      ? tab.component
      : "terminal";
  const params = typeof tab.params === "object" && tab.params ? { ...tab.params } : {};
  const legacyPwd = typeof tab.pwdUri === "string" ? tab.pwdUri : undefined;
  if (legacyPwd && typeof (params as any).pwdUri !== "string") {
    (params as any).pwdUri = legacyPwd;
  }
  const { pwdUri: _legacyPwd, ...rest } = tab;
  return { ...rest, component, params };
}

/** Collect terminal tabs from a dock item, including legacy fields. */
export function getTerminalTabs(item: DockItem | undefined): TerminalTab[] {
  if (!item) return [];
  const raw = (item.params as any)?.terminalTabs;
  if (Array.isArray(raw)) return (raw as TerminalTab[]).map(normalizeTerminalTab);
  const legacyPwd =
    typeof (item.params as any)?.pwdUri === "string"
      ? String((item.params as any).pwdUri)
      : "";
  if (!legacyPwd) return [];
  const legacyId =
    item.id && item.id !== TERMINAL_WINDOW_PANEL_ID
      ? item.id
      : `${TERMINAL_WINDOW_PANEL_ID}:${legacyPwd}`;
  return [
    normalizeTerminalTab({
      id: legacyId,
      title: item.title,
      component: "terminal",
      params: { pwdUri: legacyPwd },
    }),
  ];
}

/** Get the active terminal tab id from a dock item. */
export function getActiveTerminalTabId(item: DockItem | undefined): string | undefined {
  const id = (item?.params as any)?.activeTerminalTabId;
  if (typeof id === "string") return id;
  const tabs = getTerminalTabs(item);
  return tabs[0]?.id;
}

/** Normalize terminal dock item data for multi-tab rendering. */
export function normalizeTerminalWindowItem(
  existing: DockItem | undefined,
  incoming: DockItem,
): DockItem {
  const incomingParams = (incoming.params ?? {}) as Record<string, unknown>;
  const existingParams = (existing?.params ?? {}) as Record<string, unknown>;
  const open = incomingParams.__open as
    | {
        pwdUri?: string;
        title?: string;
        component?: string;
        params?: Record<string, unknown>;
        tabId?: string;
      }
    | undefined;
  const legacyPwd =
    typeof incomingParams.pwdUri === "string" ? String(incomingParams.pwdUri) : "";
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
        : true;

  const currentTabs = getTerminalTabs(existing);
  const currentActive = getActiveTerminalTabId(existing);

  // 1) params.terminalTabs：整体覆盖
  // 2) params.__open：追加/激活一个 terminal 子标签
  const providedTabs = Array.isArray(incomingParams.terminalTabs)
    ? (incomingParams.terminalTabs as TerminalTab[])
    : undefined;
  const nextTabs = providedTabs ? [...providedTabs] : [...currentTabs];

  let nextActive =
    typeof incomingParams.activeTerminalTabId === "string"
      ? String(incomingParams.activeTerminalTabId)
      : currentActive;

  const openPwd =
    typeof open?.pwdUri === "string" ? String(open.pwdUri).trim() : "";
  const shouldUseLegacy =
    !openPwd && Boolean(legacyPwd) && !providedTabs && currentTabs.length === 0;
  const resolvedPwd = openPwd || (shouldUseLegacy ? legacyPwd.trim() : "");

  if (resolvedPwd) {
    const id = open?.tabId ? String(open.tabId) : createTerminalTabId();
    const baseParams =
      typeof open?.params === "object" && open?.params ? { ...open.params } : {};
    const patch: TerminalTab = {
      id,
      title: typeof open?.title === "string" ? open.title : undefined,
      component: typeof open?.component === "string" ? open.component : "terminal",
      params: { ...baseParams, ...(resolvedPwd ? { pwdUri: resolvedPwd } : {}) },
    };
    const idx = nextTabs.findIndex((t) => String((t as any)?.id ?? "") === id);
    if (idx === -1) {
      nextTabs.push(patch);
    } else {
      const existingTab = nextTabs[idx]!;
      nextTabs[idx] = {
        ...existingTab,
        ...patch,
        params: {
          ...(typeof (existingTab as any)?.params === "object" ? (existingTab as any).params : {}),
          ...(patch.params ?? {}),
        },
      };
    }
    nextActive = id;
  }

  const normalizedTabs = nextTabs.map(normalizeTerminalTab);

  if (!nextActive && normalizedTabs.length > 0) nextActive = normalizedTabs[0]!.id;
  if (nextActive && !normalizedTabs.some((t) => t.id === nextActive)) {
    nextActive = normalizedTabs[0]?.id;
  }

  const nextParams: Record<string, unknown> = { ...existingParams, ...incomingParams };
  nextParams.terminalTabs = normalizedTabs;
  nextParams.activeTerminalTabId = nextActive;
  if (typeof refreshKey === "number") nextParams.__refreshKey = refreshKey;
  else delete nextParams.__refreshKey;
  nextParams.__customHeader = customHeader;
  delete nextParams.__open;
  delete nextParams.pwdUri;

  return {
    ...existing,
    ...incoming,
    id: TERMINAL_WINDOW_PANEL_ID,
    sourceKey: TERMINAL_WINDOW_PANEL_ID,
    component: TERMINAL_WINDOW_COMPONENT,
    title: existing?.title ?? incoming.title,
    params: nextParams,
  };
}
