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
import i18next from "i18next";
import { Chat } from "@/components/ai/Chat";
import { useStackPanelSlot } from "@/hooks/use-stack-panel-slot";
import { openSettingsTab } from "@/lib/globalShortcuts";
import { ExternalLink } from "lucide-react";

// Lazy-load all panel components to reduce initial bundle size.
// LeftDock wraps ComponentMap entries in <React.Suspense>.
const LazyElectrronBrowserWindow = React.lazy(() => import("@/components/browser/ElectrronBrowserWindow"));
const LazyToolResultPanel = React.lazy(() => import("@/components/tools/ToolResultPanel"));
const LazySettingsPage = React.lazy(() => import("@/components/setting/SettingsPage"));
const LazyProviderManagement = React.lazy(() =>
  import("@/components/setting/menus/ProviderManagement").then(m => ({ default: m.ProviderManagement })),
);
const LazyCalendarPage = React.lazy(() => import("@/components/calendar/Calendar"));
const LazyEmailPage = React.lazy(() => import("@/components/email/EmailPage"));
const LazyEmailComposeStackPanel = React.lazy(() => import("@/components/email/EmailComposeStackPanel"));
const LazyEmailMessageStackPanel = React.lazy(() => import("@/components/email/EmailMessageStackPanel"));
const LazyInboxPage = React.lazy(() => import("@/components/inbox/Inbox"));
const LazyTemplatePage = React.lazy(() => import("@/components/template/Template"));
const LazyFileViewer = React.lazy(() => import("@/components/file/FileViewer"));
const LazyImageViewer = React.lazy(() => import("@/components/file/ImageViewer"));
const LazyCodeViewer = React.lazy(() => import("@/components/file/CodeViewer"));
const LazyMarkdownViewer = React.lazy(() => import("@/components/file/MarkdownViewer"));
const LazyPdfViewer = React.lazy(() => import("@/components/file/PdfViewer"));
const LazyDocViewer = React.lazy(() => import("@/components/file/DocViewer"));
const LazyExcelViewer = React.lazy(() => import("@/components/file/ExcelViewer"));
const LazyVideoViewer = React.lazy(() => import("@/components/file/VideoViewer"));
const LazyBoardFileViewer = React.lazy(() => import("@/components/board/BoardFileViewer"));
const LazyTerminalViewer = React.lazy(() => import("@/components/file/TerminalViewer"));
const LazyDesktopWidgetLibraryPanel = React.lazy(() => import("@/components/desktop/DesktopWidgetLibraryPanel"));
const LazyGlobalDesktop = React.lazy(() => import("@/components/desktop/GlobalDesktop"));
const LazyFolderTreePreview = React.lazy(() => import("@/components/project/filesystem/FolderTreePreview"));
const LazyProjectFileSystemStackPanel = React.lazy(() => import("@/components/project/filesystem/ProjectFileSystemStackPanel"));
const LazySkillTranslateSlot = React.lazy(() => import("@/components/setting/skills/SkillTranslateSlot"));
const LazySchedulerTaskHistoryStackPanel = React.lazy(() =>
  import("@/components/summary/SchedulerTaskHistoryStackPanel").then(m => ({ default: m.SchedulerTaskHistoryStackPanel })),
);
const LazyAgentDetailPanel = React.lazy(() =>
  import("@/components/setting/menus/agent/AgentDetailPanel").then(m => ({ default: m.AgentDetailPanel })),
);
const LazyAgentManagement = React.lazy(() =>
  import("@/components/setting/menus/agent/AgentManagement").then(m => ({ default: m.AgentManagement })),
);
const LazySkillSettings = React.lazy(() =>
  import("@/components/setting/menus/SkillSettings").then(m => ({ default: m.SkillSettings })),
);
const LazyScheduledTasksPage = React.lazy(() => import("@/components/tasks/ScheduledTasksPage"));
const LazyStreamingCodeViewer = React.lazy(() => import("@/components/file/StreamingCodeViewer"));
const LazyDynamicWidgetStackPanel = React.lazy(() => import("@/components/desktop/dynamic-widgets/DynamicWidgetStackPanel"));
const LazySubAgentChatPanel = React.lazy(() => import("@/components/ai/SubAgentChatPanel"));
const LazyAiDebugViewer = React.lazy(() => import("@/components/ai/AiDebugViewer"));
const LazyTaskDetailPanel = React.lazy(() =>
  import("@/components/tasks/TaskDetailPanel").then(m => ({ default: m.TaskDetailPanel })),
);
const LazyPlateDocViewer = React.lazy(() => import("@/components/file/PlateDocViewer"));
const LazyStreamingPlateViewer = React.lazy(() => import("@/components/file/StreamingPlateViewer"));
const LazyProjectPage = React.lazy(() => import("@/components/project/Project"));
const LazyProjectSettingsPage = React.lazy(() => import("@/components/project/settings/ProjectSettingsPage"));
const LazyCanvasListPage = React.lazy(() => import("@/components/board/CanvasListPage"));
const LazyProjectListPage = React.lazy(() => import("@/components/project/ProjectListPage"));

/** Stack wrapper that injects a "open in settings" button into the header slot. */
function SettingsStackSlotButton({ settingsMenu }: { settingsMenu: string }) {
  const slotCtx = useStackPanelSlot();
  React.useEffect(() => {
    if (!slotCtx) return;
    slotCtx.setSlot({
      rightSlotBeforeClose: React.createElement(
        "button",
        {
          type: "button",
          className: "inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors",
          title: i18next.t('nav:panelTitle.openInSettings'),
          "aria-label": i18next.t('nav:panelTitle.openInSettings'),
          onClick: () => {
            openSettingsTab(settingsMenu);
          },
        },
        React.createElement(ExternalLink, { className: "h-3.5 w-3.5" }),
      ),
    });
    return () => slotCtx.setSlot(null);
  }, [slotCtx, settingsMenu]);
  return null;
}

/** Agent management wrapped with settings navigation slot. */
function AgentManagementStack(props: Record<string, unknown>) {
  return React.createElement(React.Fragment, null,
    React.createElement(SettingsStackSlotButton, { settingsMenu: "agents" }),
    React.createElement(LazyAgentManagement, props as any),
  );
}

/** Skill settings wrapped with settings navigation slot. */
function SkillSettingsStack(props: Record<string, unknown>) {
  return React.createElement(React.Fragment, null,
    React.createElement(SettingsStackSlotButton, { settingsMenu: "skills" }),
    React.createElement(LazySkillSettings),
  );
}

/** Folder tree preview wrapped with skill translation slot when applicable. */
function FolderTreePreviewWithSkillSlot(props: Record<string, unknown>) {
  const skillFolderPath = props.__skillFolderPath as string | undefined;
  if (skillFolderPath) {
    return React.createElement(React.Fragment, null,
      React.createElement(LazySkillTranslateSlot, { skillFolderPath }),
      React.createElement(LazyFolderTreePreview, props as any),
    );
  }
  return React.createElement(LazyFolderTreePreview, props as any);
}

type PanelComponent = React.ComponentType<any> | React.LazyExoticComponent<React.ComponentType<any>>;

export const ComponentMap: Record<string, PanelComponent> = {
  "ai-chat": Chat,
  "plant-page": LazyProjectPage,
  "electron-browser-window": LazyElectrronBrowserWindow,
  "tool-result": LazyToolResultPanel,
  "settings-page": LazySettingsPage,
  "provider-management": LazyProviderManagement,
  "calendar-page": LazyCalendarPage,
  "email-page": LazyEmailPage,
  "email-compose-stack": LazyEmailComposeStackPanel,
  "email-message-stack": LazyEmailMessageStackPanel,
  "inbox-page": LazyInboxPage,
  "template-page": LazyTemplatePage,
  "file-viewer": LazyFileViewer,
  "image-viewer": LazyImageViewer,
  "code-viewer": LazyCodeViewer,
  "markdown-viewer": LazyMarkdownViewer,
  "pdf-viewer": LazyPdfViewer,
  "doc-viewer": LazyDocViewer,
  "sheet-viewer": LazyExcelViewer,
  "video-viewer": LazyVideoViewer,
  "board-viewer": LazyBoardFileViewer,
  "terminal-viewer": LazyTerminalViewer,
  "desktop-widget-library": LazyDesktopWidgetLibraryPanel,
  "global-desktop": LazyGlobalDesktop,
  "folder-tree-preview": FolderTreePreviewWithSkillSlot,
  "project-filesystem-panel": LazyProjectFileSystemStackPanel,
  "scheduler-task-history": LazySchedulerTaskHistoryStackPanel,
  "scheduled-tasks-page": LazyScheduledTasksPage,
  "agent-detail": LazyAgentDetailPanel,
  "agent-management": AgentManagementStack,
  "skill-settings": SkillSettingsStack,
  "streaming-code-viewer": LazyStreamingCodeViewer,
  "plate-doc-viewer": LazyPlateDocViewer,
  "streaming-plate-viewer": LazyStreamingPlateViewer,
  "dynamic-widget-viewer": LazyDynamicWidgetStackPanel,
  "sub-agent-chat": LazySubAgentChatPanel,
  "ai-debug-viewer": LazyAiDebugViewer,
  "task-detail": LazyTaskDetailPanel,
  "canvas-list-page": LazyCanvasListPage,
  "project-list-page": LazyProjectListPage,
  "project-settings-page": LazyProjectSettingsPage,
};

/**
 * 根据组件名称获取友好的面板标题
 * @param componentName 组件名称
 * @returns 格式化后的面板标题
 */
export const getPanelTitle = (componentName: string) => {
  // markdown-viewer and pdf-viewer keep their non-localized names
  if (componentName === "markdown-viewer") return "Markdown";
  if (componentName === "pdf-viewer") return "PDF";
  if (componentName === "dynamic-widget-viewer") return "Widget";
  const key = `nav:panelTitle.${componentName}`;
  const translated = i18next.t(key);
  // If the key doesn't exist, i18next returns the key itself — fall back to componentName
  return translated === key ? componentName : translated;
};
