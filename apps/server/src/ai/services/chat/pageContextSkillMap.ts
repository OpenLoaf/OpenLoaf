/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Page context → auto-loaded skill mapping.
 *
 * Resolves which built-in skills should be automatically loaded based on
 * the user's current page context (injected by the frontend). Returns an
 * empty array when the page has no domain-specific skill to pre-load.
 */

import type { ChatPageContext } from '@openloaf/api/types/message'

/** Mapping from page identifier to skill names that should be auto-loaded. */
const PAGE_SKILL_MAP: Record<string, string[]> = {
  'canvas-list': ['canvas-ops-skill'],
  'temp-canvas': ['canvas-ops-skill'],
  'project-canvas': ['canvas-ops-skill', 'project-ops-skill'],
  'project-list': ['project-ops-skill'],
  'project-index': ['project-ops-skill'],
  'project-files': ['project-ops-skill'],
  'project-history': ['project-ops-skill'],
  'project-tasks': ['project-ops-skill', 'task-ops-skill'],
  'project-settings': ['project-ops-skill', 'settings-guide-skill'],
  'calendar': ['calendar-ops-skill'],
  'email': ['email-ops-skill'],
  'tasks': ['task-ops-skill'],
  'settings': ['settings-guide-skill'],
  'workbench': ['workbench-ops-skill'],
  'ai-chat': [],
  'agent-list': [],
  'skill-list': [],
}

/** Resolve auto-loaded skill names from page context. */
export function resolveAutoSkillsByPageContext(
  pageContext: ChatPageContext | undefined | null,
): string[] {
  if (!pageContext?.page) return []
  return PAGE_SKILL_MAP[pageContext.page] ?? []
}
