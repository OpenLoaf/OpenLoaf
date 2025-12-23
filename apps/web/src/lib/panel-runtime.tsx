"use client";

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/trpc";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TabActiveProvider } from "@/components/layout/TabActiveContext";

type PanelSide = "left" | "right";

type PanelEntry = {
  tabId: string;
  side: PanelSide;
  node: HTMLDivElement;
  root: Root;
  element: React.ReactElement | null;
  active: boolean;
};

type PanelHost = {
  host: HTMLElement;
  panels: Map<string, PanelEntry>;
};

// 异步队列：延后卸载 root，避免与 React 并发渲染阶段发生冲突
type PendingUnmount = { host: PanelHost; tabId: string; entry: PanelEntry };
const PENDING_UNMOUNTS: PendingUnmount[] = [];
let UNMOUNT_SCHEDULED = false;

function scheduleAsyncUnmount() {
  if (UNMOUNT_SCHEDULED) return;
  UNMOUNT_SCHEDULED = true;
  // 使用 macrotask 确保发生在渲染提交之后
  setTimeout(() => {
    UNMOUNT_SCHEDULED = false;
    while (PENDING_UNMOUNTS.length) {
      const { host, tabId, entry } = PENDING_UNMOUNTS.shift()!;
      try {
        entry.root.unmount();
      } catch {
        // 忽略可能的并发阶段卸载异常
      }
      try {
        entry.node.remove();
      } catch {
        // no-op
      }
      host.panels.delete(tabId);
    }
  }, 0);
}

const PANEL_FADE_MS = 180;
const PANEL_HOSTS: Record<PanelSide, PanelHost | null> = {
  left: null,
  right: null,
};

// Provide shared providers for panel roots.
function PanelProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}

// Create a DOM node that hosts a panel root.
function createPanelNode(host: HTMLElement, tabId: string) {
  const node = document.createElement("div");
  node.dataset.panelTabId = tabId;
  node.className = "absolute inset-0 h-full w-full min-h-0 min-w-0";
  node.style.opacity = "0";
  node.style.pointerEvents = "none";
  node.style.transition = `opacity ${PANEL_FADE_MS}ms ease-out`;
  host.appendChild(node);
  return node;
}

// Ensure a panel entry exists for a tab.
function ensurePanelEntry(side: PanelSide, tabId: string) {
  const host = PANEL_HOSTS[side];
  if (!host) return null;
  const existing = host.panels.get(tabId);
  if (existing) return existing;
  const node = createPanelNode(host.host, tabId);
  const root = createRoot(node);
  const entry: PanelEntry = {
    tabId,
    side,
    node,
    root,
    element: null,
    active: false,
  };
  host.panels.set(tabId, entry);
  return entry;
}

// Sync the DOM visibility state for a panel.
function applyPanelVisibility(entry: PanelEntry) {
  entry.node.style.opacity = entry.active ? "1" : "0";
  entry.node.style.pointerEvents = entry.active ? "auto" : "none";
}

// Bind a DOM host for panel roots.
export function bindPanelHost(side: PanelSide, host: HTMLElement | null) {
  const current = PANEL_HOSTS[side];
  if (current?.host === host) return;
  if (current) {
    // 中文注释：切换宿主时先清理旧根，避免残留挂载。
    for (const [tabId, entry] of current.panels.entries()) {
      // 改为异步卸载，避免与当前渲染冲突
      entry.node.style.opacity = "0";
      entry.node.style.pointerEvents = "none";
      PENDING_UNMOUNTS.push({ host: current, tabId, entry });
    }
    scheduleAsyncUnmount();
  }
  if (!host) {
    PANEL_HOSTS[side] = null;
    return;
  }
  PANEL_HOSTS[side] = { host, panels: new Map() };
}

// Check whether a panel root exists for a tab.
export function hasPanel(side: PanelSide, tabId: string) {
  return Boolean(PANEL_HOSTS[side]?.panels.has(tabId));
}

// Render a panel into its root.
export function renderPanel(
  side: PanelSide,
  tabId: string,
  element: React.ReactElement,
  active: boolean,
) {
  const entry = ensurePanelEntry(side, tabId);
  if (!entry) return;
  entry.element = element;
  entry.active = active;
  entry.root.render(
    <PanelProviders>
      <TabActiveProvider active={active}>{element}</TabActiveProvider>
    </PanelProviders>,
  );
  applyPanelVisibility(entry);
}

// Toggle panel active state without recreating its DOM node.
export function setPanelActive(side: PanelSide, tabId: string, active: boolean) {
  const host = PANEL_HOSTS[side];
  if (!host) return;
  const entry = host.panels.get(tabId);
  if (!entry) return;
  if (entry.active === active) {
    applyPanelVisibility(entry);
    return;
  }
  entry.active = active;
  if (entry.element) {
    entry.root.render(
      <PanelProviders>
        <TabActiveProvider active={active}>{entry.element}</TabActiveProvider>
      </PanelProviders>,
    );
  }
  applyPanelVisibility(entry);
}

// Remove panel roots for tabs that no longer exist.
export function syncPanelTabs(side: PanelSide, tabIds: string[]) {
  const host = PANEL_HOSTS[side];
  if (!host) return;
  const keep = new Set(tabIds);
  for (const [tabId, entry] of host.panels.entries()) {
    if (keep.has(tabId)) continue;
    // 中文注释：关闭 tab 时清理对应的 root，避免内存累积。
    // 改为放入异步队列，避免在 React 渲染过程中同步 unmount 触发报错
    entry.node.style.opacity = "0";
    entry.node.style.pointerEvents = "none";
    PENDING_UNMOUNTS.push({ host, tabId, entry });
  }
  if (PENDING_UNMOUNTS.length) scheduleAsyncUnmount();
}
