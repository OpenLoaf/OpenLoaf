/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { contextBridge, ipcRenderer } from 'electron';

export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  faviconUrl?: string;
  active: boolean;
};

contextBridge.exposeInMainWorld('browserTabBar', {
  platform: process.platform,
  switchTab: (tabId: string) => ipcRenderer.send('browser-tab:switch', tabId),
  closeTab: (tabId: string) => ipcRenderer.send('browser-tab:close', tabId),
  onTabsUpdated: (callback: (tabs: BrowserTab[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tabs: BrowserTab[]) => {
      callback(tabs);
    };
    ipcRenderer.on('browser-tab:state', listener);
    return () => {
      ipcRenderer.removeListener('browser-tab:state', listener);
    };
  },
  onThemeChanged: (callback: (isDark: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isDark: boolean) => {
      callback(isDark);
    };
    ipcRenderer.on('browser-tab:theme', listener);
    return () => {
      ipcRenderer.removeListener('browser-tab:theme', listener);
    };
  },
});
