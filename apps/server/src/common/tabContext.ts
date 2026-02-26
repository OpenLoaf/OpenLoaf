/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { getTabId } from "@/ai/shared/context/requestContext";

/**
 * 读取本次 /chat/sse 绑定的 TabId（apps/web 的 useTabs Tab.id）。
 */
export function requireTabId(): string {
  const tabId = getTabId();
  if (!tabId) throw new Error("tabId is required.");
  return tabId;
}
