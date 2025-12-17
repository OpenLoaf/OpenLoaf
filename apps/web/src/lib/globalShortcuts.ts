"use client";

import { create } from "zustand";
import { useTabs } from "@/hooks/use-tabs";

export type GlobalShortcutDefinition = {
  id: string;
  label: string;
  keys: string;
  note?: string;
};

export const GLOBAL_SHORTCUTS: GlobalShortcutDefinition[] = [
  { id: "sidebar.toggle", label: "Toggle sidebar", keys: "Mod+Shift+B" },
  { id: "chat.toggle", label: "Toggle chat panel", keys: "Mod+B" },
  { id: "search.toggle", label: "Search", keys: "Mod+K" },
  { id: "open.calendar", label: "Open Calendar", keys: "Mod+L" },
  { id: "open.inbox", label: "Open Inbox", keys: "Mod+I" },
  { id: "open.ai", label: "Open AI", keys: "Mod+J" },
  { id: "open.template", label: "Open Template", keys: "Mod+T" },
  { id: "tab.new", label: "New tab", keys: "Mod+0" },
  { id: "tab.switch", label: "Switch tabs", keys: "Mod+1..9" },
  { id: "tab.close", label: "Close tab", keys: "Mod+W" },
  {
    id: "settings.open",
    label: "Open Settings",
    keys: "Cmd+,",
    note: "Electron + macOS only",
  },
  {
    id: "refresh.disable",
    label: "Disable refresh",
    keys: "F5 / Mod+R",
    note: "Production only",
  },
];

type GlobalOverlayState = {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  toggleSearchOpen: () => void;
};

export const useGlobalOverlay = create<GlobalOverlayState>((set) => ({
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  toggleSearchOpen: () => set((state) => ({ searchOpen: !state.searchOpen })),
}));

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.getAttribute("role") === "textbox"
  );
}

function openSingletonTab(
  workspaceId: string,
  input: { baseId: string; component: string; title: string; icon: string },
  options?: { leftWidthPercent?: number; closeSearch?: boolean },
) {
  const { tabs, addTab, setActiveTab } = useTabs.getState();

  const existing = tabs.find(
    (tab) => tab.workspaceId === workspaceId && tab.base?.id === input.baseId,
  );
  if (existing) {
    setActiveTab(existing.id);
    if (options?.closeSearch) useGlobalOverlay.getState().setSearchOpen(false);
    return;
  }

  addTab({
    workspaceId,
    createNew: true,
    title: input.title,
    icon: input.icon,
    leftWidthPercent: options?.leftWidthPercent,
    base: { id: input.baseId, component: input.component },
  });

  if (options?.closeSearch) useGlobalOverlay.getState().setSearchOpen(false);
}

export function openSettingsTab(workspaceId: string) {
  const { tabs, addTab, setActiveTab } = useTabs.getState();

  const baseId = "base:settings";
  const existing = tabs.find(
    (tab) => tab.workspaceId === workspaceId && tab.base?.id === baseId,
  );
  if (existing) {
    setActiveTab(existing.id);
    return;
  }

  const viewportWidth =
    typeof document !== "undefined"
      ? document.documentElement.clientWidth || window.innerWidth
      : 0;

  addTab({
    workspaceId,
    createNew: true,
    title: "Settings",
    icon: "⚙️",
    leftWidthPercent: viewportWidth > 0 ? 70 : undefined,
    rightChatCollapsed: true,
    base: { id: baseId, component: "settings-page" },
  });
}

export type GlobalShortcutContext = {
  workspaceId?: string;
  isElectron: boolean;
  isMac: boolean;
};

export function handleGlobalKeyDown(event: KeyboardEvent, ctx: GlobalShortcutContext) {
  if (event.defaultPrevented) return;

  const overlay = useGlobalOverlay.getState();
  const withMod = event.metaKey || event.ctrlKey;

  const keyLower = event.key.toLowerCase();

  if (process.env.NODE_ENV !== "development") {
    if (event.key === "F5") {
      event.preventDefault();
      return;
    }

    if (withMod && keyLower === "r") {
      event.preventDefault();
      return;
    }
  }

  if (ctx.isElectron && ctx.isMac) {
    if (
      event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.key === ","
    ) {
      if (ctx.workspaceId) {
        event.preventDefault();
        openSettingsTab(ctx.workspaceId);
      }
      return;
    }
  }

  if (keyLower === "k" && withMod && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    overlay.toggleSearchOpen();
    return;
  }

  if (keyLower === "b" && withMod && !event.shiftKey && !event.altKey) {
    const state = useTabs.getState();
    const tabId = state.activeTabId;
    if (!tabId) return;
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab?.base) return;

    event.preventDefault();
    state.setTabRightChatCollapsed(tabId, !tab.rightChatCollapsed);
    return;
  }

  if (keyLower === "b" && withMod && event.shiftKey && !event.altKey) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("teatime:toggle-sidebar"));
    return;
  }

  if (!overlay.searchOpen && isEditableTarget(event.target)) return;

  if (ctx.workspaceId) {
    const quickOpenLeftWidthPercent = overlay.searchOpen ? 70 : 100;

    if (keyLower === "l" && withMod && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      openSingletonTab(
        ctx.workspaceId,
        { baseId: "base:calendar", component: "calendar-page", title: "日历", icon: "🗓️" },
        { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
      );
      return;
    }

    if (keyLower === "i" && withMod && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      openSingletonTab(
        ctx.workspaceId,
        { baseId: "base:inbox", component: "inbox-page", title: "收集箱", icon: "📥" },
        { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
      );
      return;
    }

    if (keyLower === "j" && withMod && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      openSingletonTab(
        ctx.workspaceId,
        { baseId: "base:ai-chat", component: "ai-chat", title: "AI助手", icon: "✨" },
        { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
      );
      return;
    }

    if (keyLower === "t" && withMod && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      openSingletonTab(
        ctx.workspaceId,
        { baseId: "base:template", component: "template-page", title: "模版", icon: "📄" },
        { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
      );
      return;
    }

    if (withMod && !event.shiftKey && !event.altKey) {
      const key = event.key;
      if (key === "0") {
        event.preventDefault();
        useTabs.getState().addTab({
          workspaceId: ctx.workspaceId,
          createNew: true,
        });
        return;
      }

      if (key.length === 1 && key >= "1" && key <= "9") {
        const index = Number.parseInt(key, 10) - 1;
        const workspaceTabs = useTabs.getState().getWorkspaceTabs(ctx.workspaceId);
        const tab = workspaceTabs[index];
        if (!tab) return;
        event.preventDefault();
        useTabs.getState().setActiveTab(tab.id);
        return;
      }
    }
  }

  if (keyLower === "w" && withMod) {
    event.preventDefault();
    const state = useTabs.getState();
    const tabId = state.activeTabId;
    if (!tabId) return;

    const tab = state.getTabById(tabId);
    const stack = Array.isArray(tab?.stack) ? tab.stack : [];
    const top = stack.at(-1);

    if (top) {
      if (top.denyClose !== true) state.removeStackItem(tabId, top.id);
      return;
    }

    state.closeTab(tabId);
  }
}
