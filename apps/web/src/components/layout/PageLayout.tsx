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
import { useNavigation, getViewKey } from "@/hooks/use-navigation";
import { Chat } from "@/components/ai/Chat";
import { cn } from "@/lib/utils";
import { createChatSessionId } from "@/lib/chat-session-id";

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
        // 项目视图：左侧 LeftDock + 右侧 Chat
        // TODO: 实现项目视图的 LeftDock 支持
        const chatSessionId = getChatSessionId();

        return (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            项目视图开发中...
            {/* 临时占位，Phase 5 将实现完整的项目视图 */}
          </div>
        );
      }

      case "workbench":
      case "calendar":
      case "email":
      case "scheduled-tasks": {
        // 功能页面：暂时显示占位内容
        // TODO: 需要创建适配层让 LeftDock 在新导航系统中工作
        // 或者重构 LeftDock 以支持新导航系统
        const viewNames = {
          workbench: "工作台",
          calendar: "日历",
          email: "邮箱",
          "scheduled-tasks": "定时任务",
        };

        return (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {viewNames[activeView.type]}视图开发中...
            <div className="text-xs mt-2">
              （需要适配 LeftDock 组件到新导航系统）
            </div>
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
