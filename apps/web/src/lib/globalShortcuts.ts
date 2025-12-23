"use client";

import { startTransition } from "react";
import { create } from "zustand";
import { useTabs } from "@/hooks/use-tabs";
import { AI_CHAT_TAB_INPUT } from "@teatime-ai/api/common";

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
  { id: "open.ai", label: "Open AI", keys: "Mod+T" },
  { id: "open.template", label: "Open Template", keys: "Mod+J" },
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

/** 判断当前事件目标是否为可编辑输入区域，避免快捷键打断输入。 */
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

/** 打开一个“单例 Tab”：若已存在则激活，否则创建并可选关闭搜索浮层。 */
function openSingletonTab(
  workspaceId: string,
  input: { baseId: string; component: string; title: string; icon: string },
  options?: { leftWidthPercent?: number; closeSearch?: boolean },
) {
  const { tabs, addTab, setActiveTab } = useTabs.getState();

  const existing = tabs.find((tab) => {
    if (tab.workspaceId !== workspaceId) return false;
    if (tab.base?.id === input.baseId) return true;
    // ai-chat 的 base 会在 store 层被归一化为 undefined，因此需要用 title 做单例去重。
    if (input.component === "ai-chat" && !tab.base && tab.title === input.title) return true;
    return false;
  });
  if (existing) {
    startTransition(() => {
      setActiveTab(existing.id);
    });
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

/** 打开设置页（单例 Tab）。 */
export function openSettingsTab(workspaceId: string) {
  const { tabs, addTab, setActiveTab } = useTabs.getState();

  const baseId = "base:settings";
  const existing = tabs.find(
    (tab) => tab.workspaceId === workspaceId && tab.base?.id === baseId,
  );
  if (existing) {
    startTransition(() => {
      setActiveTab(existing.id);
    });
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

/** 全局快捷键入口：统一处理 Mod/Cmd 组合键（包含打开模版/AI 助手等）。 */
export function handleGlobalKeyDown(event: KeyboardEvent, ctx: GlobalShortcutContext) {
  if (event.defaultPrevented) return;

  const overlay = useGlobalOverlay.getState();
  const withMod = event.metaKey || event.ctrlKey;

  const keyLower = event.key.toLowerCase();

  // Cmd/Ctrl + W 应视为“全局快捷键”，即使当前焦点在输入框里也要生效（关闭当前标签/面板）
  // 否则在自动聚焦 ChatInput 后会导致无法再用快捷键关闭 tab。
  if (keyLower === "w" && withMod) {
    event.preventDefault();
    const state = useTabs.getState();
    const tabId = state.activeTabId;
    if (!tabId) return;

    const tab = state.getTabById(tabId);
    const stack = Array.isArray(tab?.stack) ? tab.stack : [];
    const activeStackId = String(state.activeStackItemIdByTabId?.[tabId] ?? "");
    const top = (activeStackId ? stack.find((i) => i.id === activeStackId) : undefined) ?? stack.at(-1);

    if (top) {
      if (top.denyClose !== true) state.removeStackItem(tabId, top.id);
      return;
    }

    state.closeTab(tabId);
    return;
  }

  // Cmd/Ctrl + T 也应视为“全局快捷键”，即使当前焦点在输入框里也要生效（打开 AI 助手）。
  // 注意：浏览器环境可能会被系统/浏览器占用；这里仍然尽量拦截并执行应用内行为。
  if (ctx.workspaceId && keyLower === "t" && withMod && !event.shiftKey && !event.altKey) {
    const quickOpenLeftWidthPercent = overlay.searchOpen ? 70 : 100;
    event.preventDefault();
    openSingletonTab(
      ctx.workspaceId,
      AI_CHAT_TAB_INPUT,
      { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
    );
    return;
  }

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

    // Cmd/Ctrl + J：打开模版
    if (keyLower === "j" && withMod && !event.shiftKey && !event.altKey) {
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
        startTransition(() => {
          useTabs.getState().setActiveTab(tab.id);
        });
        return;
      }
    }
  }
}
