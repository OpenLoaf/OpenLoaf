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
import { AI_ASSISTANT_TAB_INPUT, CANVAS_LIST_TAB_INPUT, WORKBENCH_TAB_INPUT } from "@openloaf/api/common";

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
  { id: "open.canvas-list", label: "打开画布列表", keys: "Mod+K" },
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
  { id: "feedback.open", label: "意见反馈", keys: "Mod+Shift+U" },
];

type ProjectSettingsDialogState = {
  projectSettingsOpen: boolean;
  projectSettingsProjectId: string | undefined;
  projectSettingsRootUri: string | undefined;
  setProjectSettingsOpen: (open: boolean, projectId?: string, rootUri?: string) => void;
};

type GlobalOverlayState = {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  toggleSearchOpen: () => void;
  settingsOpen: boolean;
  settingsMenu: string | undefined;
  setSettingsOpen: (open: boolean, menu?: string) => void;
  feedbackOpen: boolean;
  setFeedbackOpen: (open: boolean) => void;
} & ProjectSettingsDialogState;

export const useGlobalOverlay = create<GlobalOverlayState>((set) => ({
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  toggleSearchOpen: () => set((state) => ({ searchOpen: !state.searchOpen })),
  settingsOpen: false,
  settingsMenu: undefined,
  setSettingsOpen: (open, menu) =>
    set({ settingsOpen: open, settingsMenu: open ? menu : undefined }),
  feedbackOpen: false,
  setFeedbackOpen: (open) => set({ feedbackOpen: open }),
  projectSettingsOpen: false,
  projectSettingsProjectId: undefined,
  projectSettingsRootUri: undefined,
  setProjectSettingsOpen: (open, projectId, rootUri) =>
    set({
      projectSettingsOpen: open,
      projectSettingsProjectId: open ? projectId : undefined,
      projectSettingsRootUri: open ? rootUri : undefined,
    }),
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

/** Open settings in the active tab's left dock base panel. */
export function openSettingsTab(_workspaceId: string, settingsMenu?: string) {
  const { activeTabId } = useTabs.getState();
  if (!activeTabId) return;

  const { runtimeByTabId, setTabBase, setTabBaseParams } = useTabRuntime.getState();
  const runtime = runtimeByTabId[activeTabId];
  const currentBase = runtime?.base;

  // Already on settings page – just update the active menu if specified
  if (currentBase?.component === 'settings-page') {
    if (settingsMenu) {
      setTabBaseParams(activeTabId, { settingsMenu });
    }
    return;
  }

  // Save current base and switch to settings
  setTabBase(activeTabId, {
    id: 'settings',
    component: 'settings-page',
    params: {
      ...(settingsMenu ? { settingsMenu } : {}),
      __previousBase: currentBase ?? null,
    },
  });
}

/** Close settings and restore the previous left dock base panel. */
export function closeSettingsTab() {
  const { activeTabId } = useTabs.getState();
  if (!activeTabId) return;

  const runtime = useTabRuntime.getState().runtimeByTabId[activeTabId];
  const base = runtime?.base;
  if (base?.component !== 'settings-page') return;

  const previousBase = (base.params as any)?.__previousBase;
  useTabRuntime.getState().setTabBase(
    activeTabId,
    previousBase && typeof previousBase === 'object' ? previousBase : undefined,
  );
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

  // Cmd/Ctrl + K：打开画布列表（在输入框中不生效）。
  if (ctx.workspaceId && keyLower === "k" && withMod && !event.shiftKey && !event.altKey) {
    if (!isEditableTarget(event.target)) {
      const quickOpenLeftWidthPercent = overlay.searchOpen ? 70 : 100;
      event.preventDefault();
      openSingletonTab(
        ctx.workspaceId,
        CANVAS_LIST_TAB_INPUT,
        { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
      );
      return;
    }
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

  // Mod+Shift+U：打开意见反馈（全局快捷键）。
  if (keyLower === "u" && withMod && event.shiftKey && !event.altKey) {
    event.preventDefault();
    overlay.setFeedbackOpen(!overlay.feedbackOpen);
    return;
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

  }
}
