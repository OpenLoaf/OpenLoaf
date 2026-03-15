/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { LayoutDashboard, CalendarDays, Clock, Folder, FolderKanban, Palette, Settings } from "lucide-react"

/**
 * Global quick launch items — order and colors aligned with Sidebar.
 * Sidebar order: 智能画布(purple) → 项目空间(blue) → 工作台(green) → 日历(sky) → 邮件(teal) → 任务(rose)
 */
export const QUICK_LAUNCH_ITEMS = [
  {
    baseId: "base:canvas-list", component: "canvas-list-page", labelKey: "quickLaunch.smartCanvas", icon: Palette, titleKey: "nav:canvas", tabIcon: "🎨", viewType: "canvas-list",
    iconColor: "text-ol-purple/70 group-hover:text-ol-purple",
    bgColor: "bg-ol-purple/10 group-hover:bg-ol-purple/20",
  },
  {
    baseId: "base:project-list", component: "project-list-page", labelKey: "quickLaunch.projectSpace", icon: FolderKanban, titleKey: "nav:projectList", tabIcon: "📁", viewType: "project-list",
    iconColor: "text-ol-blue/70 group-hover:text-ol-blue",
    bgColor: "bg-ol-blue/10 group-hover:bg-ol-blue/20",
  },
  {
    baseId: "base:workbench", component: "global-desktop", labelKey: "quickLaunch.workbench", icon: LayoutDashboard, titleKey: "nav:workbench", tabIcon: "bot", viewType: "workbench",
    iconColor: "text-ol-green/70 group-hover:text-ol-green",
    bgColor: "bg-ol-green/10 group-hover:bg-ol-green/20",
  },
  {
    baseId: "base:calendar", component: "calendar-page", labelKey: "quickLaunch.calendar", icon: CalendarDays, titleKey: "nav:calendar", tabIcon: "🗓️", viewType: "calendar",
    iconColor: "text-sky-500/70 group-hover:text-sky-500",
    bgColor: "bg-sky-500/10 group-hover:bg-sky-500/20",
  },
  {
    baseId: "base:scheduled-tasks", component: "scheduled-tasks-page", labelKey: "quickLaunch.tasks", icon: Clock, titleKey: "nav:tasks", tabIcon: "⏰", viewType: "scheduled-tasks",
    iconColor: "text-rose-500/70 group-hover:text-rose-500",
    bgColor: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
] as const

/** Project-level quick launch items – aligned with PROJECT_TABS in ProjectTabs.tsx / ExpandableDockTabs. */
export const PROJECT_QUICK_LAUNCH_ITEMS = [
  {
    value: "index", icon: LayoutDashboard, labelKey: "project.tabHome", featureGated: true,
    iconColor: "text-ol-blue/70 group-hover:text-ol-blue",
    bgColor: "bg-ol-blue/10 group-hover:bg-ol-blue/20",
  },
  {
    value: "files", icon: Folder, labelKey: "project.tabFiles", featureGated: false,
    iconColor: "text-ol-green/70 group-hover:text-ol-green",
    bgColor: "bg-ol-green/10 group-hover:bg-ol-green/20",
  },
  {
    value: "tasks", icon: CalendarDays, labelKey: "project.tabHistory", featureGated: true,
    iconColor: "text-ol-amber/70 group-hover:text-ol-amber",
    bgColor: "bg-ol-amber/10 group-hover:bg-ol-amber/20",
  },
  {
    value: "scheduled", icon: Clock, labelKey: "project.tabScheduled", featureGated: false,
    iconColor: "text-ol-amber/70 group-hover:text-ol-amber",
    bgColor: "bg-ol-amber/10 group-hover:bg-ol-amber/20",
  },
  {
    value: "canvas", icon: Palette, labelKey: "project.tabCanvas", featureGated: false,
    iconColor: "text-ol-green/70 group-hover:text-ol-green",
    bgColor: "bg-ol-green/10 group-hover:bg-ol-green/20",
  },
  {
    value: "settings", icon: Settings, labelKey: "project.tabSettings", featureGated: false,
    iconColor: "text-ol-text-auxiliary/70 group-hover:text-ol-text-secondary",
    bgColor: "bg-ol-surface-muted group-hover:bg-ol-surface-muted",
  },
] as const
