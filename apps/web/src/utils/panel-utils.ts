/**
 * 面板工具函数，包含组件映射和面板标题处理
 */
import React from "react";
import PlantPage from "@/components/project/Project";
import { Chat } from "@/components/chat/Chat";
import ElectrronBrowserWindow from "@/components/browser/ElectrronBrowserWindow";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import SettingsPage from "@/components/setting/SettingsPage";
import CalendarPage from "@/components/calendar/Calendar";
import InboxPage from "@/components/inbox/Inbox";

/**
 * 组件名称到组件的映射关系
 * 用于根据字符串名称动态渲染不同组件
 */
export const ComponentMap: Record<string, React.ComponentType<any>> = {
  "ai-chat": Chat, // AI聊天组件
  "plant-page": PlantPage, // 植物页面组件
  "electron-browser-window": ElectrronBrowserWindow, // 新窗口浏览器组件
  "tool-result": ToolResultPanel,
  "settings-page": SettingsPage,
  "calendar-page": CalendarPage,
  "inbox-page": InboxPage,
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
    case "calendar-page":
      return "Calendar";
    case "inbox-page":
      return "Inbox";
    default:
      // 如果没有匹配的标题，直接返回组件名称
      return componentName;
  }
};
