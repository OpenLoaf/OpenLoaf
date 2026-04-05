/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useLayoutState } from "@/hooks/use-layout-state"
import type { ChatPageContext, ChatPageStackItem } from "@openloaf/api/types/message"

/** Allowlist of stack item params keys to forward to AI (keep payload small). */
const FORWARDED_PARAM_KEYS = new Set(["filePath", "uri", "boardFolderUri", "boardFileUri", "projectId"])

/**
 * Snapshot the current layout stack and inject it into payload.pageContext.stack.
 * Returns a new payload object (does not mutate the input).
 */
export function snapshotStackForPageContext<T extends Record<string, unknown>>(payload: T): T {
  const pageContext = payload.pageContext as ChatPageContext | undefined
  if (!pageContext) return payload

  const layout = useLayoutState.getState()
  const rawStack = layout.stack ?? []
  if (rawStack.length === 0) return payload

  const stack: ChatPageStackItem[] = rawStack.map((item) => {
    const entry: ChatPageStackItem = { component: item.component }
    if (item.title) entry.title = item.title
    if (item.params) {
      const filtered: Record<string, unknown> = {}
      let hasKeys = false
      for (const key of FORWARDED_PARAM_KEYS) {
        if (key in item.params) {
          filtered[key] = item.params[key]
          hasKeys = true
        }
      }
      if (hasKeys) entry.params = filtered
    }
    return entry
  })

  return {
    ...payload,
    pageContext: { ...pageContext, stack },
  }
}
