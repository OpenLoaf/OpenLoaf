/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import type { DesktopScopeSupport, DesktopWidgetItem } from "./types";

export type DesktopWidgetCatalogItem = {
  /** 组件类型。 */
  widgetKey: DesktopWidgetItem["widgetKey"];
  /** 组件标题。 */
  title: string;
  /** 组件默认尺寸。 */
  size: DesktopWidgetItem["size"];
  /** 组件尺寸约束。 */
  constraints: DesktopWidgetItem["constraints"];
  /** 组件支持范围。 */
  support: DesktopScopeSupport;
  /** 默认 variant key（有 variant 的组件）。 */
  defaultVariant?: string;
};

/** Desktop widget catalog for selection. */
export const desktopWidgetCatalog: DesktopWidgetCatalogItem[] = [
  {
    widgetKey: "flip-clock",
    title: "Flip Clock",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
    support: { workspace: true, project: true },
    defaultVariant: "hms",
  },
  {
    widgetKey: "clock",
    title: "Clock",
    size: "2x2",
    constraints: { defaultW: 2, defaultH: 2, minW: 2, minH: 2, maxW: 3, maxH: 3 },
    support: { workspace: true, project: true },
    defaultVariant: "hm",
  },
  {
    widgetKey: "quick-actions",
    title: "Actions",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
    support: { workspace: true, project: true },
  },
  {
    widgetKey: "calendar",
    title: "日历",
    size: "5x6",
    constraints: { defaultW: 5, defaultH: 6, minW: 4, minH: 3, maxW: 8, maxH: 6 },
    support: { workspace: true, project: true },
    defaultVariant: "month",
  },
  {
    widgetKey: "chat-history",
    title: "聊天历史",
    size: "4x3",
    constraints: { defaultW: 4, defaultH: 3, minW: 3, minH: 3, maxW: 8, maxH: 6 },
    support: { workspace: true, project: true },
  },
  {
    widgetKey: "email-inbox",
    title: "邮箱",
    size: "4x3",
    constraints: { defaultW: 4, defaultH: 3, minW: 3, minH: 2, maxW: 8, maxH: 6 },
    support: { workspace: true, project: true },
  },
  {
    widgetKey: "3d-folder",
    title: "3D Folder",
    size: "4x3",
    constraints: { defaultW: 4, defaultH: 3, minW: 1, minH: 1, maxW: 12, maxH: 20 },
    support: { workspace: false, project: true },
  },
  {
    widgetKey: "video",
    title: "Video",
    size: "4x3",
    constraints: { defaultW: 4, defaultH: 3, minW: 2, minH: 2, maxW: 8, maxH: 6 },
    support: { workspace: false, project: true },
  },
  {
    widgetKey: "web-stack",
    title: "网页",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 1, minH: 1, maxW: 4, maxH: 4 },
    support: { workspace: true, project: true },
  },
];
