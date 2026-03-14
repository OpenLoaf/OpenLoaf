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

import { create } from "zustand";
import i18next from "i18next";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { AI_ASSISTANT_TAB_INPUT, CANVAS_LIST_TAB_INPUT, WORKBENCH_TAB_INPUT } from "@openloaf/api/common";
import { resolveProjectModeProjectShell } from "@/lib/project-mode";
import { applyProjectShellToTab } from "@/lib/project-shell";

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

type GlobalOverlayState = {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  toggleSearchOpen: () => void;
  settingsOpen: boolean;
  settingsMenu: string | undefined;
  setSettingsOpen: (open: boolean, menu?: string) => void;
  feedbackOpen: boolean;
  setFeedbackOpen: (open: boolean) => void;
};

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

/** 打开一个"单例视图"：若当前 base 已匹配则跳过，否则 navigate 切换。 */
function openSingletonTab(
  input: { baseId: string; component: string; title?: string; titleKey?: string; icon: string },
  options?: { leftWidthPercent?: number; closeSearch?: boolean },
) {
  const layout = useLayoutState.getState();

  // Resolve title from titleKey using i18next
  const title = input.titleKey ? i18next.t(input.titleKey) : input.title || 'Tab';

  // Check if already on this view
  if (input.component === "ai-chat") {
    // AI chat has no base
    if (!layout.base) {
      if (options?.closeSearch) useGlobalOverlay.getState().setSearchOpen(false);
      return;
    }
  } else if (layout.base?.id === input.baseId) {
    if (options?.closeSearch) useGlobalOverlay.getState().setSearchOpen(false);
    return;
  }

  useAppView.getState().navigate({
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

/** Open settings in the current view's left dock base panel. */
export function openSettingsTab(settingsMenu?: string) {
  const layout = useLayoutState.getState();
  const view = useAppView.getState();
  const projectShell = resolveProjectModeProjectShell(view.projectShell, "settings");
  if (projectShell) {
    applyProjectShellToTab("main", {
      ...projectShell,
      section: "settings",
    });
    if (settingsMenu) {
      layout.setBaseParams({ settingsMenu });
    }
    return;
  }

  const currentBase = layout.base;

  // Already on settings page – just update the active menu if specified
  if (currentBase?.component === 'settings-page') {
    if (settingsMenu) {
      layout.setBaseParams({ settingsMenu });
    }
    return;
  }

  // Save current base and switch to settings
  // 中文注释：进入全局设置时关闭当前 stack，确保设置页成为前景页并按页面规则隐藏右侧 chat。
  layout.clearStack();
  layout.setBase({
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
  const layout = useLayoutState.getState();
  const base = layout.base;
  if (base?.component !== 'settings-page') return;

  const previousBase = (base.params as any)?.__previousBase;
  layout.setBase(
    previousBase && typeof previousBase === 'object' ? previousBase : undefined,
  );
}

export type GlobalShortcutContext = {
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

  if (keyLower === "t" && withMod && !event.shiftKey && !event.altKey) {
    const quickOpenLeftWidthPercent = overlay.searchOpen ? 70 : 100;
    event.preventDefault();
    openSingletonTab(
      WORKBENCH_TAB_INPUT,
      { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
    );
    return;
  }

  if (keyLower === "i" && withMod && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    openSingletonTab(
      AI_ASSISTANT_TAB_INPUT,
      { closeSearch: true },
    );
    return;
  }

  if (keyLower === "k" && withMod && !event.shiftKey && !event.altKey) {
    if (!isEditableTarget(event.target)) {
      const quickOpenLeftWidthPercent = overlay.searchOpen ? 70 : 100;
      event.preventDefault();
      openSingletonTab(
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
      event.preventDefault();
      openSettingsTab();
      return;
    }
  }

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
    const layout = useLayoutState.getState();
    if (!layout.base) return;
    event.preventDefault();
    layout.setRightChatCollapsed(!layout.rightChatCollapsed);
    return;
  }

  if (keyLower === "b" && withMod && event.shiftKey && !event.altKey) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("openloaf:toggle-sidebar"));
    return;
  }

  if (!overlay.searchOpen && isEditableTarget(event.target)) return;

  {
    const quickOpenLeftWidthPercent = overlay.searchOpen ? 70 : 100;

    if (keyLower === "l" && withMod && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      openSingletonTab(
        { baseId: "base:calendar", component: "calendar-page", title: "日历", icon: "🗓️" },
        { leftWidthPercent: quickOpenLeftWidthPercent, closeSearch: true },
      );
      return;
    }

  }
}
