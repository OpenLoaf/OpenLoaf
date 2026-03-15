/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { BrowserWindow, ipcMain, nativeTheme, WebContentsView } from 'electron';
import { randomUUID } from 'node:crypto';
import { resolveWindowIconPath } from '../resolveWindowIcon';
import { WEBPACK_ENTRIES } from '../webpackEntries';
import { getChromeUserAgent, normalizeExternalUrl, safeDisposeWebContents } from '../ipc/webContentsViews';

const TAB_BAR_HEIGHT = 36;

type TabInfo = {
  id: string;
  view: WebContentsView;
  title: string;
  url: string;
  faviconUrl?: string;
};

let browserWin: BrowserWindow | null = null;
let tabs: TabInfo[] = [];
let activeTabId: string | null = null;
let ipcRegistered = false;

/** Serialize tab state for the tab bar renderer. */
function serializeTabs() {
  return tabs.map((t) => ({
    id: t.id,
    title: t.title,
    url: t.url,
    faviconUrl: t.faviconUrl,
    active: t.id === activeTabId,
  }));
}

/** Push current tab state to the tab bar webContents. */
function pushTabState() {
  if (!browserWin || browserWin.isDestroyed()) return;
  try {
    browserWin.webContents.send('browser-tab:state', serializeTabs());
  } catch {
    // ignore
  }
}

/** Get content bounds for tab views (below the tab bar). */
function getContentBounds(): { x: number; y: number; width: number; height: number } {
  if (!browserWin || browserWin.isDestroyed()) return { x: 0, y: 0, width: 0, height: 0 };
  const [width, height] = browserWin.getContentSize();
  return { x: 0, y: TAB_BAR_HEIGHT, width, height: Math.max(0, height - TAB_BAR_HEIGHT) };
}

/** Switch to a specific tab by ID. */
function switchToTab(tabId: string) {
  if (activeTabId === tabId) return;

  // Hide the previously active tab view.
  const prevTab = tabs.find((t) => t.id === activeTabId);
  if (prevTab) {
    try { prevTab.view.setVisible(false); } catch { /* ignore */ }
  }

  activeTabId = tabId;
  const nextTab = tabs.find((t) => t.id === tabId);
  if (nextTab) {
    const bounds = getContentBounds();
    nextTab.view.setBounds(bounds);
    try { nextTab.view.setVisible(true); } catch { /* ignore */ }
  }

  pushTabState();
  // Update window title to active tab.
  if (nextTab && browserWin && !browserWin.isDestroyed()) {
    browserWin.setTitle(nextTab.title || 'Browser');
  }
}

/** Close a tab by ID. */
function closeTab(tabId: string) {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  const tab = tabs[idx];
  tabs.splice(idx, 1);

  // Remove view from window.
  if (browserWin && !browserWin.isDestroyed()) {
    try { browserWin.contentView.removeChildView(tab.view); } catch { /* ignore */ }
  }
  try { safeDisposeWebContents(tab.view.webContents); } catch { /* ignore */ }

  // If we closed the active tab, switch to the nearest one.
  if (activeTabId === tabId) {
    activeTabId = null;
    if (tabs.length > 0) {
      const nextIdx = Math.min(idx, tabs.length - 1);
      switchToTab(tabs[nextIdx].id);
    }
  }

  // If no tabs remain, close the window.
  if (tabs.length === 0) {
    if (browserWin && !browserWin.isDestroyed()) {
      browserWin.close();
    }
    return;
  }

  pushTabState();
}

/** Register IPC listeners for tab bar actions (once). */
function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on('browser-tab:switch', (_event, tabId: string) => {
    if (typeof tabId === 'string') switchToTab(tabId);
  });

  ipcMain.on('browser-tab:close', (_event, tabId: string) => {
    if (typeof tabId === 'string') closeTab(tabId);
  });
}

/** Create the singleton browser window. */
function ensureBrowserWindow(): BrowserWindow {
  if (browserWin && !browserWin.isDestroyed()) {
    browserWin.show();
    browserWin.focus();
    return browserWin;
  }

  registerIpc();

  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  const windowIcon = resolveWindowIconPath();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#f5f5f5',
    ...(windowIcon ? { icon: windowIcon } : {}),
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 10 },
        }
      : {}),
    ...(isWindows
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? '#141416' : '#f5f5f5',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#f5f5f5' : '#0f0e12',
            height: TAB_BAR_HEIGHT,
          },
        }
      : {}),
    webPreferences: {
      preload: WEBPACK_ENTRIES.browserTabBarPreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the tab bar HTML renderer.
  void win.loadURL(WEBPACK_ENTRIES.browserTabBar);

  // Once DOM is ready, push initial tab state and theme.
  win.webContents.on('dom-ready', () => {
    pushTabState();
    try {
      win.webContents.send('browser-tab:theme', nativeTheme.shouldUseDarkColors);
    } catch { /* ignore */ }
  });

  // Sync theme changes to the tab bar renderer.
  const handleThemeUpdated = () => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send('browser-tab:theme', nativeTheme.shouldUseDarkColors);
    } catch { /* ignore */ }
    // Update window background color.
    win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#141416' : '#f5f5f5');
  };
  nativeTheme.on('updated', handleThemeUpdated);

  // Resize active tab view when window is resized.
  const handleResize = () => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (active) {
      active.view.setBounds(getContentBounds());
    }
  };
  win.on('resize', handleResize);
  win.on('maximize', handleResize);
  win.on('unmaximize', handleResize);

  // Cleanup on close.
  win.on('closed', () => {
    nativeTheme.removeListener('updated', handleThemeUpdated);
    for (const tab of tabs) {
      try { safeDisposeWebContents(tab.view.webContents); } catch { /* ignore */ }
    }
    tabs = [];
    activeTabId = null;
    browserWin = null;
  });

  browserWin = win;
  return win;
}

/**
 * Open a URL in the tabbed browser window.
 * Creates the window if it doesn't exist, adds a new tab, and switches to it.
 */
export function openUrlInBrowserWindow(url: string): { id: number } {
  const normalized = normalizeExternalUrl(url);
  const parsed = new URL(normalized);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  const win = ensureBrowserWindow();
  const tabId = randomUUID();

  // Create a WebContentsView for the tab content.
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    view.webContents.setUserAgent(getChromeUserAgent());
  } catch { /* ignore */ }

  const tab: TabInfo = {
    id: tabId,
    view,
    title: parsed.hostname,
    url: normalized,
  };
  tabs.push(tab);

  // Listen for title and favicon updates.
  view.webContents.on('page-title-updated', (_event, title) => {
    tab.title = title || tab.url;
    pushTabState();
    if (activeTabId === tabId && browserWin && !browserWin.isDestroyed()) {
      browserWin.setTitle(tab.title);
    }
  });

  view.webContents.on('page-favicon-updated', (_event, favicons) => {
    tab.faviconUrl = Array.isArray(favicons) ? favicons[0] : undefined;
    pushTabState();
  });

  view.webContents.on('did-navigate', (_event, navUrl) => {
    tab.url = navUrl;
    pushTabState();
  });

  view.webContents.on('did-navigate-in-page', (_event, navUrl) => {
    tab.url = navUrl;
    pushTabState();
  });

  // Intercept window.open: open as new tab instead of new window.
  view.webContents.setWindowOpenHandler((details) => {
    if (details.url && /^https?:/i.test(details.url)) {
      openUrlInBrowserWindow(details.url);
    }
    return { action: 'deny' };
  });

  // Intercept Cmd+W / Ctrl+W to close the active tab instead of the window.
  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const cmdOrCtrl = process.platform === 'darwin' ? input.meta : input.control;
    if (!cmdOrCtrl) return;
    const key = input.key?.toLowerCase();
    if (key === 'w') {
      event.preventDefault();
      closeTab(tabId);
    }
  });

  // Add view to the window and switch to it.
  win.contentView.addChildView(view);
  view.setVisible(false); // switchToTab will make it visible
  void view.webContents.loadURL(normalized);
  switchToTab(tabId);

  return { id: win.id };
}
