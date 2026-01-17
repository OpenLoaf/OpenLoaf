/** Browser panel component registry key. */
export const BROWSER_WINDOW_COMPONENT = "electron-browser-window" as const;

/** Terminal panel component registry key. */
export const TERMINAL_WINDOW_COMPONENT = "terminal-viewer" as const;

/** Stable panel id for the browser window stack item. */
export const BROWSER_WINDOW_PANEL_ID = "browser-window" as const;

/** Stable panel id for the terminal window stack item. */
export const TERMINAL_WINDOW_PANEL_ID = "terminal-window" as const;

/** Supported panel component ids for tab stacks. */
export type PanelComponentId =
  | typeof BROWSER_WINDOW_COMPONENT
  | typeof TERMINAL_WINDOW_COMPONENT;

/** Supported panel ids for tab stacks. */
export type TabPanelId =
  | typeof BROWSER_WINDOW_PANEL_ID
  | typeof TERMINAL_WINDOW_PANEL_ID;

/** Browser sub-tab metadata for the browser panel. */
export type BrowserTab = {
  id: string;
  url: string;
  title?: string;
  viewKey: string;
  cdpTargetIds?: string[];
};

/** Terminal sub-tab metadata for the terminal panel. */
export type TerminalTab = {
  id: string;
  title?: string;
  component?: string;
  params?: Record<string, unknown>;
  /** Legacy field retained for backward compatibility. */
  pwdUri?: string;
};
