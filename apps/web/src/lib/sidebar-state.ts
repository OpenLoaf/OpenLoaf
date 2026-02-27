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

const SIDEBAR_STATE_COOKIE = "sidebar_state";

/** Read the left sidebar open state from DOM/cookie when possible. */
export function getLeftSidebarOpen(): boolean | null {
  if (typeof document === "undefined") return null;
  const sidebar = document.querySelector(
    '[data-slot="sidebar"][data-side="left"]',
  ) as HTMLElement | null;
  const state = sidebar?.getAttribute("data-state");
  if (state === "expanded") return true;
  if (state === "collapsed") return false;
  // 逻辑：优先读 DOM 状态，读不到再回退 cookie。
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SIDEBAR_STATE_COOKIE}=([^;]+)`),
  );
  if (!match) return null;
  return match[1] === "true";
}

/** Emit a global request to open/close the left sidebar. */
export function emitSidebarOpenRequest(open: boolean) {
  if (typeof window === "undefined") return;
  const event = new CustomEvent("openloaf:set-sidebar-open", { detail: { open } });
  window.dispatchEvent(event);
}
