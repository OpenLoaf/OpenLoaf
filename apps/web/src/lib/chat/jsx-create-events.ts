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

type JsxCreateRefreshPayload = {
  /** JSX file uri to refresh. */
  uri: string;
};

/** Event name for JSX create refresh. */
const JSX_CREATE_EVENT_NAME = "jsx-create-refresh";
/** Event target for JSX create refresh notifications. */
const jsxCreateEventTarget = new EventTarget();

/** Emit a JSX create refresh event. */
export function emitJsxCreateRefresh(payload: JsxCreateRefreshPayload) {
  // 逻辑：将 uri 作为 CustomEvent 载荷广播给所有监听者。
  const event = new CustomEvent<JsxCreateRefreshPayload>(JSX_CREATE_EVENT_NAME, {
    detail: payload,
  });
  jsxCreateEventTarget.dispatchEvent(event);
}

/** Subscribe to JSX create refresh events. */
export function onJsxCreateRefresh(
  handler: (payload: JsxCreateRefreshPayload) => void,
) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<JsxCreateRefreshPayload>).detail;
    if (!detail) return;
    handler(detail);
  };
  jsxCreateEventTarget.addEventListener(JSX_CREATE_EVENT_NAME, listener);
  return () => jsxCreateEventTarget.removeEventListener(JSX_CREATE_EVENT_NAME, listener);
}
