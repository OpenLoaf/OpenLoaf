/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Generate a stable sub-tab id with a random UUID fallback. */
function createSubTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Create a new browser sub-tab id. */
export function createBrowserTabId(): string {
  return createSubTabId();
}

/** Create a new terminal sub-tab id. */
export function createTerminalTabId(): string {
  return createSubTabId();
}
