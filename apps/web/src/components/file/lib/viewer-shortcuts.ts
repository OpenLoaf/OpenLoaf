/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/** Event shape used for find shortcut detection. */
export type FindShortcutEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  stopPropagation?: () => void;
};

/** Check whether the event is a Cmd/Ctrl+F find shortcut. */
export function isFindShortcutEvent(event: FindShortcutEvent): boolean {
  const key = event.key.toLowerCase();
  const withMod = event.metaKey || event.ctrlKey;
  // 逻辑：只拦截 Cmd/Ctrl+F，保留 Shift/Alt 组合键的默认行为。
  if (!withMod) return false;
  if (event.shiftKey || event.altKey) return false;
  return key === "f";
}

/** Stop propagation for find shortcuts to avoid triggering global search. */
export function stopFindShortcutPropagation(event: FindShortcutEvent): boolean {
  if (!isFindShortcutEvent(event)) return false;
  // 逻辑：阻止事件冒泡，避免触发全局 Cmd/Ctrl+F 搜索面板。
  event.stopPropagation?.();
  return true;
}
