/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { startTransition } from "react";
import { create } from "zustand";
import i18next from "i18next";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { AI_ASSISTANT_TAB_INPUT, WORKBENCH_TAB_INPUT } from "@openloaf/api/common";

export type GlobalShortcutDefinition = {
  id: string;
  label: string;
  keys: string;
  note?: string;
};

export const GLOBAL_SHORTCUTS: GlobalShortcutDefinition[] = [
  { id: "sidebar.toggle", label: "切换侧边栏", keys: "Mod+Shift+B" },
  { id: "chat.toggle", label: "切换对话面板", keys: "Mod+B" },
  { id: "search.toggle", label: "搜索", keys: "Mod+F" },
  { id: "open.calendar", label: "打开日历", keys: "Mod+L" },
  { id: "open.workbench", label: "打开工作台", keys: "Mod+T" },
  { id: "open.ai-assistant", label: "打开 AI 助手", keys: "Mod+I" },
  { id: "open.template", label: "打开模板", keys: "Mod+J" },
  { id: "tab.new", label: "新建标签页", keys: "Mod+0" },
  { id: "tab.switch", label: "切换标签页", keys: "Mod+1..9" },
  { id: "tab.close", label: "关闭标签页", keys: "Mod+W" },
  {
    id: "settings.open",
    label: "打开设置",
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
  input: { baseId: string; component: string; title?: string; titleKey?: string; icon: string },
  options?: { leftWidthPercent?: number; closeSearch?: boolean },
) {
  const { tabs, addTab, setActiveTab } = useTabs.getState();
  const runtimeByTabId = useTabRuntime.getState().runtimeByTabId;

  // Resolve title from titleKey using i18next
  const title = input.titleKey ? i18next.t(input.titleKey) : input.title || 'Tab';

  const existing = tabs.find((tab) => {
    if (tab.workspaceId !== workspaceId) return false;
    const runtime = runtimeByTabId[tab.id];
    if (runtime?.base?.id === input.baseId) return true;
    // ai-chat 的 base 会在 store 层被归一化为 undefined，因此需要用 title 做单例去重。
    if (input.component === "ai-chat" && !runtime?.base && tab.title === title) return true;
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
    title,
    icon: input.icon,
    leftWidthPercent: options?.leftWidthPercent,
    base:
      input.component === "ai-chat"
        ? undefined
        : { id: input.baseId, component: input.component },
  });

  if (options?.closeSearch) useGlobalOverlay.getState().setSearchOpen(false);
}

/** 打开设置页（单例 Tab）。 */
export function openSettingsTab(workspaceId: string, settingsMenu?: string) {
  const { tabs, addTab, setActiveTab } = useTabs.getState();
  const runtimeByTabId = useTabRuntime.getState().runtimeByTabId;
  const { setTabBaseParams } = useTabRuntime.getState();

  const baseId = "base:settings";
  const existing = tabs.find(
    (tab) =>
      tab.workspaceId === workspaceId && runtimeByTabId[tab.id]?.base?.id === baseId,
  );
  if (existing) {
    startTransition(() => {
      setActiveTab(existing.id);
      if (settingsMenu) {
        setTabBaseParams(existing.id, { settingsMenu });
      }
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
    title: "设置",
    icon: "⚙️",
    leftWidthPercent: viewportWidth > 0 ? 70 : undefined,
    rightChatCollapsed: true,
    base: { id: baseId, component: "settings-page", params: settingsMenu ? { settingsMenu } : undefined },
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

  if (!event.key) return
  const keyLower = event.key.toLowerCase();

  // Cmd/Ctrl + W 应视为“全局快捷键”，即使当前焦点在输入框里也要生效（关闭当前标签/面板）
  // 否则在自动聚焦 ChatInput 后会导致无法再用快捷键关闭 tab。
  if (keyLower === "w" && withMod) {
    event.preventDefault();
    const state = useTabs.getState();
    const tabId = state.activeTabId;
    if (!tabId) return;

    const runtime = useTabRuntime.getState().runtimeByTabId[tabId];
    const stack = Array.isArray(runtime?.stack) ? runtime!.stack : [];
    const activeStackId = String(runtime?.activeStackItemId ?? "");
    const top =
      (activeStackId ? stack.find((i) => i.id === activeStackId) : undefined) ??
      stack.at(-1);

    if (top) {
      if (top.denyClose !== true) useTabRuntime.getState().removeStackItem(tabId, top.id);
      return;
    }

    state.closeTab(tabId);
    return;
  }

  // Cmd/Ctrl + T 也应视为”全局快捷键”，即使当前焦点在输入框里也要生效（打开工作台）。
  // 注意：浏览器环境可能会被系统/浏览器占用；这里仍然尽量拦截并执行应用内行为。
  if (ctx.workspaceId && keyLower === "t" && withMod && !event.shiftKey && !event.altKey) {
    const quickOpenLeftWidthPercent = overlay.searchOpen ? 70 : 100;
    event.preventDefault();
    openSingletonTab(
      ctx.workspaceId,
      WORKBENCH_TAB_INPUT,
      { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
    );
    return;
  }

  // Cmd/Ctrl + I：打开 AI 助手（全局快捷键，在输入框中也生效）。
  if (ctx.workspaceId && keyLower === "i" && withMod && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    openSingletonTab(
      ctx.workspaceId,
      AI_ASSISTANT_TAB_INPUT,
      { closeSearch: true },
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

  if (keyLower === "f" && withMod && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    overlay.toggleSearchOpen();
    return;
  }

  if (keyLower === "b" && withMod && !event.shiftKey && !event.altKey) {
    const state = useTabs.getState();
    const tabId = state.activeTabId;
    if (!tabId) return;
    const runtime = useTabRuntime.getState().runtimeByTabId[tabId];
    if (!runtime?.base) return;

    event.preventDefault();
    useTabRuntime.getState().setTabRightChatCollapsed(tabId, !runtime.rightChatCollapsed);
    return;
  }

  if (keyLower === "b" && withMod && event.shiftKey && !event.altKey) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("openloaf:toggle-sidebar"));
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
