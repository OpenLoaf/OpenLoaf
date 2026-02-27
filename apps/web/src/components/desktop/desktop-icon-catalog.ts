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

import type { DesktopIconKey, DesktopScopeSupport } from "./types";
import { getDesktopIconByKey } from "./widgets/DesktopIconWidget";

export type DesktopIconCatalogItem = {
  /** 图标键值。 */
  iconKey: DesktopIconKey;
  /** 图标标题。 */
  title: string;
  /** 支持范围。 */
  support: DesktopScopeSupport;
};

/** Desktop icon catalog for default desktop items. */
export const desktopIconCatalog: DesktopIconCatalogItem[] = [
  {
    iconKey: "files",
    title: "文件",
    support: { workspace: false, project: true },
  },
  {
    iconKey: "tasks",
    title: "任务",
    support: { workspace: false, project: true },
  },
  {
    iconKey: "search",
    title: "搜索",
    support: { workspace: true, project: true },
  },
  {
    iconKey: "settings",
    title: "设置",
    support: { workspace: true, project: true },
  },
];

/** Build the icon element from the catalog key. */
export function getDesktopIconNode(iconKey: DesktopIconKey) {
  return getDesktopIconByKey(iconKey);
}
