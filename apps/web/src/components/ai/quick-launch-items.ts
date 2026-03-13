/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { LayoutDashboard, CalendarDays, Mail, Clock, Folder, Palette, Settings } from "lucide-react"

export const QUICK_LAUNCH_ITEMS = [
  {
    baseId: "base:workbench", component: "global-desktop", labelKey: "quickLaunch.workbench", icon: LayoutDashboard, titleKey: "quickLaunch.workbench", tabIcon: "bot",
    iconColor: "text-ol-amber/70 group-hover:text-ol-amber",
    bgColor: "bg-ol-amber/10 group-hover:bg-ol-amber/20",
  },
  {
    baseId: "base:calendar", component: "calendar-page", labelKey: "quickLaunch.calendar", icon: CalendarDays, titleKey: "quickLaunch.calendar", tabIcon: "🗓️",
    iconColor: "text-ol-blue/70 group-hover:text-ol-blue",
    bgColor: "bg-ol-blue/10 group-hover:bg-ol-blue/20",
  },
  {
    baseId: "base:mailbox", component: "email-page", labelKey: "quickLaunch.mailbox", icon: Mail, titleKey: "quickLaunch.mailbox", tabIcon: "📧",
    iconColor: "text-ol-green/70 group-hover:text-ol-green",
    bgColor: "bg-ol-green/10 group-hover:bg-ol-green/20",
  },
  {
    baseId: "base:scheduled-tasks", component: "scheduled-tasks-page", labelKey: "quickLaunch.tasks", icon: Clock, titleKey: "quickLaunch.tasks", tabIcon: "⏰",
    iconColor: "text-ol-red/70 group-hover:text-ol-red",
    bgColor: "bg-ol-red/10 group-hover:bg-ol-red/20",
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
