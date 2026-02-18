"use client";

import type { DesktopIconKey, DesktopItem, DesktopScope, DesktopWidgetItem } from "./types";
import { desktopIconCatalog } from "./desktop-icon-catalog";
import { desktopWidgetCatalog } from "./widget-catalog";

/** Resolve whether a widget key is supported in the given scope. */
export function isDesktopWidgetSupported(
  scope: DesktopScope,
  widgetKey: DesktopWidgetItem["widgetKey"]
) {
  // 逻辑：动态组件不在 catalog 中，但在所有作用域下都支持。
  if (widgetKey === "dynamic") return true;
  const target = desktopWidgetCatalog.find((item) => item.widgetKey === widgetKey);
  return Boolean(target?.support?.[scope]);
}

/** Resolve whether an icon key is supported in the given scope. */
export function isDesktopIconSupported(scope: DesktopScope, iconKey: DesktopIconKey) {
  const target = desktopIconCatalog.find((item) => item.iconKey === iconKey);
  return Boolean(target?.support?.[scope]);
}

/** Resolve whether a desktop item is supported in the given scope. */
export function isDesktopItemSupported(scope: DesktopScope, item: DesktopItem) {
  if (item.kind === "widget") {
    return isDesktopWidgetSupported(scope, item.widgetKey);
  }
  return isDesktopIconSupported(scope, item.iconKey);
}

/** Filter desktop items by scope, dropping unsupported items. */
export function filterDesktopItemsByScope(scope: DesktopScope, items: DesktopItem[]) {
  // 中文注释：只保留当前作用域可用的组件/图标。
  return items.filter((item) => isDesktopItemSupported(scope, item));
}
