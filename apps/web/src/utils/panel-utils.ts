/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * 面板工具函数，包含组件映射和面板标题处理
 */
import React from "react";
import { Chat } from "@/components/ai/Chat";
import ElectrronBrowserWindow from "@/components/browser/ElectrronBrowserWindow";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import SettingsPage from "@/components/setting/SettingsPage";
import { ProviderManagement } from "@/components/setting/menus/ProviderManagement";
import CalendarPage from "@/components/calendar/Calendar";
import EmailPage from "@/components/email/EmailPage";
import EmailComposeStackPanel from "@/components/email/EmailComposeStackPanel";
import EmailMessageStackPanel from "@/components/email/EmailMessageStackPanel";
import InboxPage from "@/components/inbox/Inbox";
import TemplatePage from "@/components/template/Template";
import FileViewer from "@/components/file/FileViewer";
import ImageViewer from "@/components/file/ImageViewer";
import CodeViewer from "@/components/file/CodeViewer";
import MarkdownViewer from "@/components/file/MarkdownViewer";
import PdfViewer from "@/components/file/PdfViewer";
import DocViewer from "@/components/file/DocViewer";
import ExcelViewer from "@/components/file/ExcelViewer";
import VideoViewer from "@/components/file/VideoViewer";
import BoardFileViewer from "@/components/board/BoardFileViewer";
import TerminalViewer from "@/components/file/TerminalViewer";
import DesktopWidgetLibraryPanel from "@/components/desktop/DesktopWidgetLibraryPanel";
import WorkspaceDesktop from "@/components/workspace/WorkspaceDesktop";
import FolderTreePreview from "@/components/project/filesystem/FolderTreePreview";
import { SchedulerTaskHistoryStackPanel } from "@/components/summary/SchedulerTaskHistoryStackPanel";
import { AgentDetailPanel } from "@/components/setting/menus/agent/AgentDetailPanel";
import { AgentManagement } from "@/components/setting/menus/agent/AgentManagement";
import ScheduledTasksPage from "@/components/tasks/ScheduledTasksPage";
import StreamingCodeViewer from "@/components/file/StreamingCodeViewer";
import DynamicWidgetStackPanel from "@/components/desktop/dynamic-widgets/DynamicWidgetStackPanel";
import SubAgentChatPanel from "@/components/ai/SubAgentChatPanel";
import AiDebugViewer from "@/components/ai/AiDebugViewer";

// 逻辑：文稿编辑器包含完整 Plate.js 插件集，使用 lazy 避免首屏阻塞。
const LazyPlateDocViewer = React.lazy(() => import("@/components/file/PlateDocViewer"));
const LazyStreamingPlateViewer = React.lazy(() => import("@/components/file/StreamingPlateViewer"));

/**
 * 组件名称到组件的映射关系
 * 用于根据字符串名称动态渲染不同组件
 */
// 逻辑：项目页包含 Plate 编辑器，使用 lazy 避免首屏被重组件阻塞。
const LazyProjectPage = React.lazy(() => import("@/components/project/Project"));

type PanelComponent = React.ComponentType<any> | React.LazyExoticComponent<React.ComponentType<any>>;

export const ComponentMap: Record<string, PanelComponent> = {
  "ai-chat": Chat, // AI聊天组件
  "plant-page": LazyProjectPage, // 植物页面组件
  "electron-browser-window": ElectrronBrowserWindow, // 新窗口浏览器组件
  "tool-result": ToolResultPanel,
  "settings-page": SettingsPage,
  "provider-management": ProviderManagement,
  "calendar-page": CalendarPage,
  "email-page": EmailPage,
  "email-compose-stack": EmailComposeStackPanel,
  "email-message-stack": EmailMessageStackPanel,
  "inbox-page": InboxPage,
  "template-page": TemplatePage,
  "file-viewer": FileViewer,
  "image-viewer": ImageViewer,
  "code-viewer": CodeViewer,
  "markdown-viewer": MarkdownViewer,
  "pdf-viewer": PdfViewer,
  "doc-viewer": DocViewer,
  "sheet-viewer": ExcelViewer,
  "video-viewer": VideoViewer,
  "board-viewer": BoardFileViewer,
  "terminal-viewer": TerminalViewer,
  "desktop-widget-library": DesktopWidgetLibraryPanel,
  "workspace-desktop": WorkspaceDesktop,
  "folder-tree-preview": FolderTreePreview,
  "scheduler-task-history": SchedulerTaskHistoryStackPanel,
  "scheduled-tasks-page": ScheduledTasksPage,
  "agent-detail": AgentDetailPanel,
  "agent-management": AgentManagement,
  "streaming-code-viewer": StreamingCodeViewer,
  "plate-doc-viewer": LazyPlateDocViewer,
  "streaming-plate-viewer": LazyStreamingPlateViewer,
  "dynamic-widget-viewer": DynamicWidgetStackPanel,
  "sub-agent-chat": SubAgentChatPanel,
  "ai-debug-viewer": AiDebugViewer,
};

/**
 * 根据组件名称获取友好的面板标题
 * @param componentName 组件名称
 * @returns 格式化后的面板标题
 */
export const getPanelTitle = (componentName: string) => {
  switch (componentName) {
    case "ai-chat":
      return "AI Chat";
    case "plant-page":
      return "Plant";
    case "electron-browser-window":
      return "Browser Window";
    case "tool-result":
      return "Tool Result";
    case "settings-page":
      return "Settings";
    case "provider-management":
      return "Provider Management";
    case "calendar-page":
      return "Calendar";
    case "email-page":
      return "Email";
    case "email-compose-stack":
      return "写邮件";
    case "email-message-stack":
      return "邮件正文";
    case "inbox-page":
      return "Inbox";
    case "template-page":
      return "Template";
    case "file-viewer":
      return "File";
    case "image-viewer":
      return "Image";
    case "code-viewer":
      return "Code";
    case "markdown-viewer":
      return "Markdown";
    case "pdf-viewer":
      return "PDF";
    case "doc-viewer":
      return "DOC";
    case "sheet-viewer":
      return "Sheet";
    case "video-viewer":
      return "Video";
    case "board-viewer":
      return "Board";
    case "terminal-viewer":
      return "Terminal";
    case "desktop-widget-library":
      return "Widget Library";
    case "workspace-desktop":
      return "工作台";
    case "folder-tree-preview":
      return "Folder";
    case "scheduler-task-history":
      return "Scheduler History";
    case "scheduled-tasks-page":
      return "定时任务";
    case "agent-detail":
      return "Agent助手 详情";
    case "agent-management":
      return "Agent助手 管理";
    case "streaming-code-viewer":
      return "写入文件";
    case "plate-doc-viewer":
      return "文稿";
    case "streaming-plate-viewer":
      return "编辑文稿";
    case "dynamic-widget-viewer":
      return "Widget";
    case "sub-agent-chat":
      return "子代理";
    default:
      // 如果没有匹配的标题，直接返回组件名称
      return componentName;
  }
};
