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
import { SkillSettings } from "@/components/setting/menus/SkillSettings";
import { useStackPanelSlot } from "@/hooks/use-stack-panel-slot";
import { openSettingsTab } from "@/lib/globalShortcuts";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { ExternalLink } from "lucide-react";
import ScheduledTasksPage from "@/components/tasks/ScheduledTasksPage";
import StreamingCodeViewer from "@/components/file/StreamingCodeViewer";
import DynamicWidgetStackPanel from "@/components/desktop/dynamic-widgets/DynamicWidgetStackPanel";
import SubAgentChatPanel from "@/components/ai/SubAgentChatPanel";
import AiDebugViewer from "@/components/ai/AiDebugViewer";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";

// 逻辑：文稿编辑器包含完整 Plate.js 插件集，使用 lazy 避免首屏阻塞。
const LazyPlateDocViewer = React.lazy(() => import("@/components/file/PlateDocViewer"));
const LazyStreamingPlateViewer = React.lazy(() => import("@/components/file/StreamingPlateViewer"));

/**
 * 组件名称到组件的映射关系
 * 用于根据字符串名称动态渲染不同组件
 */
// 逻辑：项目页包含 Plate 编辑器，使用 lazy 避免首屏被重组件阻塞。
const LazyProjectPage = React.lazy(() => import("@/components/project/Project"));

/** Stack wrapper that injects a "open in settings" button into the header slot. */
function SettingsStackSlotButton({ settingsMenu }: { settingsMenu: string }) {
  const slotCtx = useStackPanelSlot();
  const { workspace } = useWorkspace();
  React.useEffect(() => {
    if (!slotCtx) return;
    slotCtx.setSlot({
      rightSlotBeforeClose: React.createElement(
        "button",
        {
          type: "button",
          className: "inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors",
          title: "在设置中打开",
          "aria-label": "在设置中打开",
          onClick: () => {
            if (workspace?.id) openSettingsTab(workspace.id, settingsMenu);
          },
        },
        React.createElement(ExternalLink, { className: "h-3.5 w-3.5" }),
      ),
    });
    return () => slotCtx.setSlot(null);
  }, [slotCtx, workspace?.id, settingsMenu]);
  return null;
}

/** Agent management wrapped with settings navigation slot. */
function AgentManagementStack(props: Record<string, unknown>) {
  return React.createElement(React.Fragment, null,
    React.createElement(SettingsStackSlotButton, { settingsMenu: "agents" }),
    React.createElement(AgentManagement, props as any),
  );
}

/** Skill settings wrapped with settings navigation slot. */
function SkillSettingsStack(props: Record<string, unknown>) {
  return React.createElement(React.Fragment, null,
    React.createElement(SettingsStackSlotButton, { settingsMenu: "skills" }),
    React.createElement(SkillSettings),
  );
}

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
  "agent-management": AgentManagementStack,
  "skill-settings": SkillSettingsStack,
  "streaming-code-viewer": StreamingCodeViewer,
  "plate-doc-viewer": LazyPlateDocViewer,
  "streaming-plate-viewer": LazyStreamingPlateViewer,
  "dynamic-widget-viewer": DynamicWidgetStackPanel,
  "sub-agent-chat": SubAgentChatPanel,
  "ai-debug-viewer": AiDebugViewer,
  "task-detail": TaskDetailPanel,
};

/**
 * 根据组件名称获取友好的面板标题
 * @param componentName 组件名称
 * @returns 格式化后的面板标题
 */
export const getPanelTitle = (componentName: string) => {
  switch (componentName) {
    case "ai-chat":
      return "AI 对话";
    case "plant-page":
      return "项目";
    case "electron-browser-window":
      return "浏览器窗口";
    case "tool-result":
      return "工具结果";
    case "settings-page":
      return "设置";
    case "provider-management":
      return "模型供应商管理";
    case "calendar-page":
      return "日历";
    case "email-page":
      return "邮箱";
    case "email-compose-stack":
      return "写邮件";
    case "email-message-stack":
      return "邮件正文";
    case "inbox-page":
      return "收件箱";
    case "template-page":
      return "模板";
    case "file-viewer":
      return "文件";
    case "image-viewer":
      return "图片";
    case "code-viewer":
      return "代码";
    case "markdown-viewer":
      return "Markdown";
    case "pdf-viewer":
      return "PDF";
    case "doc-viewer":
      return "文档";
    case "sheet-viewer":
      return "表格";
    case "video-viewer":
      return "视频";
    case "board-viewer":
      return "画布";
    case "terminal-viewer":
      return "终端";
    case "desktop-widget-library":
      return "组件库";
    case "workspace-desktop":
      return "工作台";
    case "folder-tree-preview":
      return "文件夹";
    case "scheduler-task-history":
      return "任务历史";
    case "scheduled-tasks-page":
      return "任务看板";
    case "agent-detail":
      return "Agent助手 详情";
    case "agent-management":
      return "Agent助手 管理";
    case "skill-settings":
      return "技能设置";
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
    case "task-detail":
      return "任务详情";
    default:
      // 如果没有匹配的标题，直接返回组件名称
      return componentName;
  }
};
