/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  faviconUrl?: string;
  active: boolean;
};

declare global {
  interface Window {
    browserTabBar: {
      platform: string;
      switchTab: (tabId: string) => void;
      closeTab: (tabId: string) => void;
      onTabsUpdated: (callback: (tabs: BrowserTab[]) => void) => () => void;
      onThemeChanged: (callback: (isDark: boolean) => void) => () => void;
    };
  }
}

function renderTabs(tabs: BrowserTab[]) {
  const tabBar = document.getElementById('tab-bar')!;
  const emptyMsg = document.getElementById('empty-msg')!;

  if (tabs.length === 0) {
    tabBar.style.display = 'none';
    emptyMsg.style.display = 'flex';
    return;
  }

  tabBar.style.display = 'flex';
  emptyMsg.style.display = 'none';

  tabBar.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = `tab${tab.active ? ' active' : ''}`;
    el.dataset.tabId = tab.id;

    const hasFavicon = Boolean(tab.faviconUrl);
    el.innerHTML = `
      <img class="tab-favicon${hasFavicon ? '' : ' hidden'}"
           src="${hasFavicon ? escapeAttr(tab.faviconUrl!) : ''}"
           onerror="this.classList.add('hidden')" />
      <span class="tab-title" title="${escapeAttr(tab.title || tab.url)}">${escapeHtml(tab.title || tab.url)}</span>
      <span class="tab-close" data-close="${tab.id}">&times;</span>
    `;

    el.addEventListener('click', (e) => {
      const closeTarget = (e.target as HTMLElement).closest('[data-close]');
      if (closeTarget) {
        e.stopPropagation();
        window.browserTabBar.closeTab(tab.id);
        return;
      }
      window.browserTabBar.switchTab(tab.id);
    });

    tabBar.appendChild(el);
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  // Apply platform class for macOS traffic light padding.
  if (window.browserTabBar.platform === 'darwin') {
    document.body.classList.add('darwin');
  }

  window.browserTabBar.onTabsUpdated(renderTabs);

  window.browserTabBar.onThemeChanged((isDark) => {
    document.documentElement.classList.toggle('dark', isDark);
  });
});
