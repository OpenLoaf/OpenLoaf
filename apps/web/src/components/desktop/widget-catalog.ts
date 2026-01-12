"use client";

import type { DesktopWidgetItem } from "./types";

export type DesktopWidgetCatalogItem = {
  /** 组件类型。 */
  widgetKey: DesktopWidgetItem["widgetKey"];
  /** 组件标题。 */
  title: string;
  /** 组件默认尺寸。 */
  size: DesktopWidgetItem["size"];
  /** 组件尺寸约束。 */
  constraints: DesktopWidgetItem["constraints"];
};

/** Desktop widget catalog for selection. */
export const desktopWidgetCatalog: DesktopWidgetCatalogItem[] = [
  {
    widgetKey: "flip-clock",
    title: "Flip Clock",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
  },
  {
    widgetKey: "clock",
    title: "Clock",
    size: "2x2",
    constraints: { defaultW: 2, defaultH: 2, minW: 2, minH: 2, maxW: 3, maxH: 3 },
  },
  {
    widgetKey: "quick-actions",
    title: "Actions",
    size: "4x2",
    constraints: { defaultW: 4, defaultH: 2, minW: 2, minH: 2, maxW: 6, maxH: 3 },
  },
  {
    widgetKey: "3d-folder",
    title: "3D Folder",
    size: "4x3",
    constraints: { defaultW: 4, defaultH: 3, minW: 1, minH: 1, maxW: 12, maxH: 20 },
  },
];
