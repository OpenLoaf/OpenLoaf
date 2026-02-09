"use client";

import type { DockItem, Tab } from "@tenas-ai/api/common";

/** Tab metadata persisted in storage. */
export type TabMeta = Pick<
  Tab,
  | "id"
  | "workspaceId"
  | "title"
  | "icon"
  | "isPin"
  | "chatSessionId"
  | "chatParams"
  | "chatLoadHistory"
  | "createdAt"
  | "lastActiveAt"
> & {
  /** Multi-session ids for the tab. */
  chatSessionIds?: string[];
  /** Active session index in chatSessionIds. */
  activeSessionIndex?: number;
  /** Session title overrides keyed by session id. */
  chatSessionTitles?: Record<string, string>;
};

/** Tab runtime state stored in memory only. */
export type TabRuntime = {
  /** Left dock base panel. */
  base?: DockItem;
  /** Left dock stack overlays. */
  stack: DockItem[];
  /** Left dock width in percent. */
  leftWidthPercent: number;
  /** Optional minimum width for left dock in px. */
  minLeftWidth?: number;
  /** Whether right chat is collapsed. */
  rightChatCollapsed?: boolean;
  /** Snapshot of right chat collapsed state before opening a board. */
  rightChatCollapsedSnapshot?: boolean;
  /** Whether the stack is hidden (minimized). */
  stackHidden?: boolean;
  /** Active stack item id. */
  activeStackItemId?: string;
};

/** Tab view composed from meta + runtime. */
export type TabView = TabMeta & TabRuntime;
