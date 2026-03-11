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

import * as React from "react";
import type { DockItem } from "@openloaf/api/common";
import { useNavigation, getViewKey } from "@/hooks/use-navigation";
import { Chat } from "@/components/ai/Chat";
import { cn } from "@/lib/utils";
import { createChatSessionId } from "@/lib/chat-session-id";
import { LeftDockNew } from "./LeftDockNew";

const RIGHT_CHAT_MIN_PX = 360;
const LEFT_DOCK_MIN_PX = 300;
const DIVIDER_WIDTH_PX = 4;

/**
 * PageLayout - 新的页面布局组件，替代 TabLayout
 *
 * 核心改动：
 * - 移除 Tab 概念，直接管理视图（View）
 * - 每个视图有独立的运行时状态（ViewRuntime）
 * - Workspace Chat 直接显示，不需要 Tab 包装
 */
export function PageLayout() {
  const activeView = useNavigation((s) => s.activeView);
  const activeProjectId = useNavigation((s) => s.activeProjectId);
  const getViewRuntime = useNavigation((s) => s.getViewRuntime);
  const setViewRuntime = useNavigation((s) => s.setViewRuntime);

  const viewKey = activeView ? getViewKey(activeView) : null;
  const viewRuntime = viewKey ? getViewRuntime(viewKey) : null;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);

  // 监听容器宽度变化
  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 计算布局尺寸
  const leftWidthPercent = viewRuntime?.leftWidthPercent ?? 0;
  const rightChatCollapsed = viewRuntime?.rightChatCollapsed ?? true;
  const minLeftWidth = viewRuntime?.minLeftWidth ?? LEFT_DOCK_MIN_PX;

  const leftWidthPx = Math.max((containerWidth * leftWidthPercent) / 100, minLeftWidth);
  const rightChatWidthPx = rightChatCollapsed ? 0 : RIGHT_CHAT_MIN_PX;

  // 拖拽调整宽度
  const handleDividerMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (!viewKey) return;
      e.preventDefault();
      setIsDragging(true);

      const startX = e.clientX;
      const startWidth = leftWidthPx;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(minLeftWidth, startWidth + deltaX);
        const maxWidth = containerWidth - rightChatWidthPx - DIVIDER_WIDTH_PX;
        const clampedWidth = Math.min(newWidth, maxWidth);
        const newPercent = (clampedWidth / containerWidth) * 100;

        setViewRuntime(viewKey, {
          leftWidthPercent: Math.min(100, Math.max(0, newPercent)),
        });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [viewKey, leftWidthPx, containerWidth, minLeftWidth, rightChatWidthPx, setViewRuntime]
  );

  // 获取或创建 Chat Session ID
  const getChatSessionId = React.useCallback(() => {
    if (!activeView || !viewKey) return "";

    switch (activeView.type) {
      case "workspace-chat":
        return activeView.chatSessionId;
      case "project": {
        // 项目视图：从 viewRuntime 获取或创建新的 session
        const runtime = getViewRuntime(viewKey);
        const existingSessionId = (runtime as any).chatSessionId;
        if (existingSessionId) return existingSessionId;

        const newSessionId = createChatSessionId();
        setViewRuntime(viewKey, { chatSessionId: newSessionId } as any);
        return newSessionId;
      }
      default:
        return "";
    }
  }, [activeView, viewKey, getViewRuntime, setViewRuntime]);

  // 渲染不同类型的视图
  const renderView = () => {
    if (!activeView) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          请选择一个视图
        </div>
      );
    }

    switch (activeView.type) {
      case "workspace-chat": {
        // Workspace Chat 直接显示 Chat 组件（单会话模式）
        return (
          <div className="flex h-full w-full">
            <Chat
              chatSessionId={activeView.chatSessionId}
              chatParams={{}}
              chatLoadHistory={true}
              enableMultiSession={false}
            />
          </div>
        );
      }

      case "project": {
        // 项目视图：LeftDockNew + RightChat 布局（多会话模式）
        if (!viewRuntime || !viewKey) return null;

        // 获取项目信息
        const projectId = activeView.projectId;

        // 确保 leftDock 已初始化（使用项目文件系统面板）
        const leftDock = viewRuntime.leftDock || {
          id: `project:${projectId}`,
          component: "plant-page",
          params: { projectId, rootUri: "" }, // rootUri 稍后会从项目信息获取
        };

        // 获取或创建 Chat Session ID（用于 Right Chat）
        const chatSessionId = viewRuntime.chatSessionId || (() => {
          const newSessionId = createChatSessionId();
          setViewRuntime(viewKey, { chatSessionId: newSessionId });
          return newSessionId;
        })();

        const showRightChat = !rightChatCollapsed;
        const showDivider = showRightChat && leftWidthPercent > 0;

        return (
          <div className="flex h-full w-full">
            {/* Left Dock */}
            {leftWidthPercent > 0 && (
              <div
                className="relative flex-shrink-0 overflow-hidden"
                style={{ width: `${leftWidthPx}px` }}
              >
                <LeftDockNew
                  workspaceId={activeProjectId || ""}
                  base={leftDock}
                  stack={(viewRuntime.stack || []) as DockItem[]}
                  stackHidden={viewRuntime.stackHidden ?? false}
                  activeStackItemId={viewRuntime.activeStackItemId}
                />
              </div>
            )}

            {/* Divider */}
            {showDivider && (
              <div
                className="relative flex-shrink-0 cursor-col-resize bg-border hover:bg-primary/20 transition-colors"
                style={{ width: `${DIVIDER_WIDTH_PX}px` }}
                onMouseDown={handleDividerMouseDown}
              />
            )}

            {/* Right Chat - 多会话模式 */}
            {showRightChat && (
              <div className="relative flex-1 overflow-hidden">
                <Chat
                  chatSessionId={chatSessionId}
                  chatParams={{ projectId }}
                  chatLoadHistory={true}
                  enableMultiSession={true}
                />
              </div>
            )}
          </div>
        );
      }

      case "workbench":
      case "calendar":
      case "email":
      case "scheduled-tasks": {
        // 功能页面：LeftDockNew + RightChat 布局
        if (!viewRuntime || !viewKey) return null;

        // 映射视图类型到组件名称
        const componentMap: Record<string, string> = {
          workbench: "workspace-desktop",
          calendar: "calendar-page",
          email: "email-page",
          "scheduled-tasks": "scheduled-tasks-page",
        };

        const component = componentMap[activeView.type];
        if (!component) return null;

        // 确保 leftDock 已初始化
        const leftDock = viewRuntime.leftDock || {
          id: `base:${activeView.type}`,
          component,
        };

        // 获取或创建 Chat Session ID（用于 Right Chat）
        const chatSessionId = viewRuntime.chatSessionId || (() => {
          const newSessionId = createChatSessionId();
          setViewRuntime(viewKey, { chatSessionId: newSessionId });
          return newSessionId;
        })();

        const showRightChat = !rightChatCollapsed;
        const showDivider = showRightChat && leftWidthPercent > 0;

        return (
          <div className="flex h-full w-full">
            {/* Left Dock */}
            {leftWidthPercent > 0 && (
              <div
                className="relative flex-shrink-0 overflow-hidden"
                style={{ width: `${leftWidthPx}px` }}
              >
                <LeftDockNew
                  workspaceId={activeProjectId || ""}
                  base={leftDock}
                  stack={(viewRuntime.stack || []) as DockItem[]}
                  stackHidden={viewRuntime.stackHidden ?? false}
                  activeStackItemId={viewRuntime.activeStackItemId}
                />
              </div>
            )}

            {/* Divider */}
            {showDivider && (
              <div
                className="relative flex-shrink-0 cursor-col-resize bg-border hover:bg-primary/20 transition-colors"
                style={{ width: `${DIVIDER_WIDTH_PX}px` }}
                onMouseDown={handleDividerMouseDown}
              />
            )}

            {/* Right Chat */}
            {showRightChat && (
              <div className="relative flex-1 overflow-hidden">
                <Chat
                  chatSessionId={chatSessionId}
                  chatParams={{ viewType: activeView.type }}
                  chatLoadHistory={true}
                  enableMultiSession={false}
                />
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-full w-full overflow-hidden",
        "bg-background",
        isDragging && "select-none"
      )}
    >
      {renderView()}
    </div>
  );
}
