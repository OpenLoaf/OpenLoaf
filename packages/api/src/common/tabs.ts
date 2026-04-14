/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type DockItem = {
  /** Stable UI identity (also used as `panelKey`). */
  id: string;
  /** Component registry key (e.g. `plant-page`, `electron-browser`). */
  component: string;
  /** Small, reconstructable params only (avoid large blobs). */
  params?: Record<string, unknown>;
  /** Optional UI title override. */
  title?: string;
  /** Optional de-dupe key (e.g. toolCallId). */
  sourceKey?: string;

  denyClose?: boolean;
};

export interface Tab {
  /** Random tab id (tabId), independent from chat session id. */
  id: string;
  title: string;
  icon?: string;
  isPin?: boolean;

  /** Right-side chat session. */
  chatSessionId: string;
  /** Extra params sent with chat requests (small). */
  chatParams?: Record<string, unknown>;
  /** Whether to load history for current chatSessionId. */
  chatLoadHistory?: boolean;
  /** Whether right chat is collapsed (only allowed when base exists). */
  rightChatCollapsed?: boolean;

  /** Left dock base (project). */
  base?: DockItem;
  /** Left dock stack overlays. */
  stack: DockItem[];
  /** Left dock width in percent (0-100). */
  leftWidthPercent: number;
  /** Optional minimum width for left dock in px. */
  minLeftWidth?: number;

  createdAt: number;
  lastActiveAt: number;
};

/**
 * Workbench 的"单例 Tab"输入定义（统一单一事实来源）。
 * - baseId 用于在业务侧做"单例"去重判断
 * - component 用于渲染注册表组件
 * - titleKey 由前端使用 i18next 翻译（从 nav namespace 读取）
 */
export const WORKBENCH_TAB_INPUT = {
  baseId: "base:workbench",
  component: "global-desktop",
  titleKey: "nav:workbench",
  icon: "bot",
} as const;

export const TEMP_CHAT_TAB_INPUT = {
  titleKey: "nav:temporaryChat",
  icon: "sparkles",
} as const;

export const TEMP_CANVAS_TAB_INPUT = {
  titleKey: "nav:temporaryCanvas",
  icon: "🎨",
} as const;

export const AI_ASSISTANT_TAB_INPUT = {
  baseId: "base:ai-assistant",
  component: "ai-chat",
  titleKey: "nav:aiAssistant",
  icon: "sparkles",
} as const;

export const CANVAS_LIST_TAB_INPUT = {
  baseId: "base:canvas-list",
  component: "canvas-list-page",
  titleKey: "nav:canvas",
  icon: "🎨",
} as const;

export const PROJECT_LIST_TAB_INPUT = {
  baseId: "base:project-list",
  component: "project-list-page",
  titleKey: "nav:projectList",
  icon: "📁",
} as const;

export const SKILLS_TAB_INPUT = {
  baseId: "base:skills",
  component: "skill-settings",
  titleKey: "nav:skills",
  icon: "🧩",
} as const;

export const AGENTS_TAB_INPUT = {
  baseId: "base:agents",
  component: "agent-management",
  titleKey: "nav:agents",
  icon: "🤖",
} as const;

export const CONNECTIONS_TAB_INPUT = {
  baseId: "base:connections",
  component: "connections-market",
  titleKey: "nav:connections",
  icon: "🔌",
} as const;

export const DEFAULT_TAB_INFO = {
  titleKey: AI_ASSISTANT_TAB_INPUT.titleKey,
  icon: AI_ASSISTANT_TAB_INPUT.icon,
} as const;
