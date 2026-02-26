/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import * as React from "react";
import { useTabs } from "./use-tabs";
import { useTabRuntime } from "./use-tab-runtime";
import type { TabMeta, TabRuntime, TabView } from "./tab-types";

const EMPTY_RUNTIME: TabRuntime = {
  stack: [],
  leftWidthPercent: 0,
  rightChatCollapsed: false,
  rightChatCollapsedSnapshot: undefined,
  stackHidden: false,
  activeStackItemId: "",
};

/** Normalize an arbitrary tab-like value into TabMeta. */
function normalizeTabMeta(input: unknown): TabMeta | undefined {
  if (!input || typeof input !== "object") return undefined;
  const tab = input as TabMeta;
  if (!tab.id || !tab.workspaceId) return undefined;
  return {
    id: tab.id,
    workspaceId: tab.workspaceId,
    title: tab.title,
    icon: tab.icon,
    isPin: tab.isPin,
    chatSessionId: tab.chatSessionId,
    chatSessionIds: Array.isArray(tab.chatSessionIds) ? tab.chatSessionIds : undefined,
    activeSessionIndex:
      typeof tab.activeSessionIndex === "number" ? tab.activeSessionIndex : undefined,
    chatSessionTitles:
      typeof tab.chatSessionTitles === "object" && tab.chatSessionTitles
        ? (tab.chatSessionTitles as Record<string, string>)
        : undefined,
    chatParams: tab.chatParams,
    chatLoadHistory: tab.chatLoadHistory,
    createdAt: tab.createdAt,
    lastActiveAt: tab.lastActiveAt,
  };
}

/** Build a TabView from meta and runtime. */
function buildTabView(meta?: TabMeta, runtime?: TabRuntime): TabView | undefined {
  if (!meta) return undefined;
  const safeRuntime = runtime ?? EMPTY_RUNTIME;
  return {
    ...meta,
    base: safeRuntime.base,
    stack: Array.isArray(safeRuntime.stack) ? safeRuntime.stack : [],
    leftWidthPercent: safeRuntime.leftWidthPercent ?? 0,
    minLeftWidth: safeRuntime.minLeftWidth,
    rightChatCollapsed: safeRuntime.rightChatCollapsed ?? false,
    rightChatCollapsedSnapshot: safeRuntime.rightChatCollapsedSnapshot,
    stackHidden: safeRuntime.stackHidden ?? false,
    activeStackItemId: safeRuntime.activeStackItemId ?? "",
  };
}

/** Get TabView by id for non-React callers. */
export function getTabViewById(tabId: string): TabView | undefined {
  const rawTab = useTabs.getState().getTabById(tabId);
  const meta = normalizeTabMeta(rawTab);
  if (!meta) return undefined;
  const runtime = useTabRuntime.getState().runtimeByTabId[tabId];
  return buildTabView(meta, runtime);
}

/** Resolve TabView for the given tab id. */
export function useTabView(tabId?: string): TabView | undefined {
  const rawTab = useTabs((state) => (tabId ? state.getTabById(tabId) : undefined));
  const runtime = useTabRuntime((state) =>
    tabId ? state.runtimeByTabId[tabId] : undefined,
  );
  const meta = React.useMemo(() => normalizeTabMeta(rawTab), [rawTab]);

  return React.useMemo(() => buildTabView(meta, runtime), [meta, runtime]);
}
