export type DockItem = {
  /** Stable UI identity (also used as `panelKey`). */
  id: string;
  /** Component registry key (e.g. `plant-page`, `electron-browser`). */
  component: string;
  /** Small, reconstructable params only (avoid large blobs). */
  params?: Record<string, unknown>;
  /** Optional UI title override. */
  title?: string;
  /** Optional de-dupe key (e.g. toolCallId). */
  sourceKey?: string;
};

export interface Tab {
  /** Random tab id (tabId), independent from chat session id. */
  id: string;
  workspaceId: string;
  title: string;
  icon?: string;
  isPin?: boolean;

  /** Right-side chat session. */
  chatSessionId: string;
  /** Extra params sent with chat requests (small). */
  chatParams?: Record<string, unknown>;
  /** Whether to load history for current chatSessionId. */
  chatLoadHistory?: boolean;
  /** Whether right chat is collapsed (only allowed when base exists). */
  rightChatCollapsed?: boolean;

  /** Left dock base (project). */
  base?: DockItem;
  /** Left dock stack overlays. */
  stack: DockItem[];
  /** Left dock width in percent (0-100). */
  leftWidthPercent: number;
  /** Optional minimum width for left dock in px. */
  minLeftWidth?: number;

  createdAt: number;
  lastActiveAt: number;
}

export const DEFAULT_TAB_INFO = {
  title: "Ai Chat",
  icon: "bot",
} as const;
