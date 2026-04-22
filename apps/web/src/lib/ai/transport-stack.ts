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
import { getChatScope } from "@/lib/chat-scope"
import type { ChatPageContext, ChatPageStackItem } from "@openloaf/api/types/message"

/** Allowlist of stack item params keys to forward to AI (keep payload small). */
const FORWARDED_PARAM_KEYS = new Set(["filePath", "uri", "boardFolderUri", "boardFileUri", "projectId"])

/**
 * Build a fresh pageContext snapshot from the current layout + app-view state
 * and merge it into the outgoing chat payload. Layout is the source of truth
 * at send time — any stale pageContext on the payload is overwritten so the
 * AI always sees the page the user is actually on.
 */
export function snapshotPageContext<T extends Record<string, unknown>>(payload: T): T {
  const layout = useLayoutState.getState()
  const chatScope = getChatScope()
  const existing = (payload.pageContext ?? chatScope.pageContext) as ChatPageContext | undefined

  const base = layout.base
  const page = base?.component ?? existing?.page ?? 'unknown'
  const pageTitle = base?.title ?? existing?.pageTitle
  const projectId = existing?.projectId ?? chatScope.projectId ?? undefined
  const boardId = existing?.boardId ?? chatScope.boardId ?? undefined
  const scope: 'global' | 'project' = projectId ? 'project' : 'global'

  const rawStack = layout.stack ?? []
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

  const pageContext: ChatPageContext = {
    scope,
    page,
    ...(pageTitle ? { pageTitle } : {}),
    ...(projectId ? { projectId } : {}),
    ...(boardId ? { boardId } : {}),
    ...(stack.length > 0 ? { stack } : {}),
  }

  return { ...payload, pageContext }
}
