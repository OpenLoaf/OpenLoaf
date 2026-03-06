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

/**
 * 导航状态管理
 *
 * 用于管理用户可见的导航状态（Sidebar 高亮、Header 标题等）
 * 与 useTabs 配合使用：
 * - use-navigation 管理"用户看到的导航状态"
 * - useTabs 管理"后台的 Tab 状态"
 */

export type NavigationViewType =
  | "workbench"
  | "calendar"
  | "email"
  | "scheduled-tasks"
  | "project"
  | "workspace-chat"
  | "ai-assistant"
  | null;

/** 结构化的当前激活视图 */
export type ActiveView =
  | { type: "workspace-chat"; chatSessionId: string }
  | { type: "project"; projectId: string }
  | { type: "workbench" }
  | { type: "calendar" }
  | { type: "email" }
  | { type: "scheduled-tasks" }
  | { type: "ai-assistant" };

/** 视图运行时状态（布局尺寸、折叠状态等） */
export interface ViewRuntime {
  leftDock?: { id: string; component: string; params?: Record<string, unknown> };
  stack?: unknown[];
  leftWidthPercent?: number;
  minLeftWidth?: number;
  rightChatCollapsed?: boolean;
  stackHidden?: boolean;
  activeStackItemId?: string;
  chatSessionId?: string;
}

/** 从 ActiveView 生成唯一的视图 key */
export function getViewKey(view: ActiveView): string {
  switch (view.type) {
    case "workspace-chat":
      return `workspace-chat:${view.chatSessionId}`;
    case "project":
      return `project:${view.projectId}`;
    default:
      return `page:${view.type}`;
  }
}

export interface NavigationState {
  /** 当前激活的视图类型（用于 Sidebar 高亮） */
  activeViewType: NavigationViewType;

  /** 当前激活的项目 ID（用于项目导航） */
  activeProjectId: string | null;

  /** 当前激活的 Workspace Chat Session ID */
  activeWorkspaceChatSessionId: string | null;

  /** 当前激活的工作区 ID */
  activeWorkspaceId: string | null;

  /** 结构化的当前激活视图（派生自 activeViewType + context） */
  activeView: ActiveView | null;

  /** 视图运行时状态缓存 */
  viewRuntimes: Record<string, ViewRuntime>;

  /** 设置激活的视图 */
  setActiveView: (viewType: NavigationViewType) => void;

  /** 设置激活的项目 */
  setActiveProject: (projectId: string | null) => void;

  /** 设置激活的 Workspace Chat */
  setActiveWorkspaceChat: (sessionId: string | null) => void;

  /** 设置当前工作区 ID */
  setActiveWorkspaceId: (workspaceId: string | null) => void;

  /** 获取当前激活的视图信息 */
  getActiveView: () => {
    viewType: NavigationViewType;
    projectId: string | null;
    workspaceChatSessionId: string | null;
  };

  /** 获取视图运行时状态 */
  getViewRuntime: (viewKey: string) => ViewRuntime | null;

  /** 更新视图运行时状态（浅合并） */
  setViewRuntime: (viewKey: string, partial: Partial<ViewRuntime>) => void;
}

/** 根据 viewType 和上下文构建 ActiveView */
function buildActiveView(
  viewType: NavigationViewType,
  projectId: string | null,
  chatSessionId: string | null,
): ActiveView | null {
  switch (viewType) {
    case "workspace-chat":
      return chatSessionId ? { type: "workspace-chat", chatSessionId } : null;
    case "project":
      return projectId ? { type: "project", projectId } : null;
    case "workbench":
      return { type: "workbench" };
    case "calendar":
      return { type: "calendar" };
    case "email":
      return { type: "email" };
    case "scheduled-tasks":
      return { type: "scheduled-tasks" };
    case "ai-assistant":
      return { type: "ai-assistant" };
    default:
      return null;
  }
}

export const useNavigation = create<NavigationState>((set, get) => ({
  activeViewType: null,
  activeProjectId: null,
  activeWorkspaceChatSessionId: null,
  activeWorkspaceId: null,
  activeView: null,
  viewRuntimes: {},

  setActiveView: (viewType) => {
    const state = get();
    set({
      activeViewType: viewType,
      activeView: buildActiveView(
        viewType,
        state.activeProjectId,
        state.activeWorkspaceChatSessionId,
      ),
    });
  },

  setActiveProject: (projectId) => {
    set({
      activeViewType: "project",
      activeProjectId: projectId,
      activeView: projectId ? { type: "project", projectId } : null,
    });
  },

  setActiveWorkspaceChat: (sessionId) => {
    set({
      activeViewType: "workspace-chat",
      activeWorkspaceChatSessionId: sessionId,
      activeView: sessionId
        ? { type: "workspace-chat", chatSessionId: sessionId }
        : null,
    });
  },

  setActiveWorkspaceId: (workspaceId) => {
    set({ activeWorkspaceId: workspaceId });
  },

  getActiveView: () => {
    const state = get();
    return {
      viewType: state.activeViewType,
      projectId: state.activeProjectId,
      workspaceChatSessionId: state.activeWorkspaceChatSessionId,
    };
  },

  getViewRuntime: (viewKey) => {
    return get().viewRuntimes[viewKey] ?? null;
  },

  setViewRuntime: (viewKey, partial) => {
    set((state) => ({
      viewRuntimes: {
        ...state.viewRuntimes,
        [viewKey]: { ...state.viewRuntimes[viewKey], ...partial },
      },
    }));
  },
}));
