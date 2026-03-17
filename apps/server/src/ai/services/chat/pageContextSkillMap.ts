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
 * the user's current page context (injected by the frontend).
 */

import type { ChatPageContext } from '@openloaf/api/types/message'

/** Mapping from page identifier to skill names that should be auto-loaded. */
const PAGE_SKILL_MAP: Record<string, string[]> = {
  'canvas-list': ['canvas-ops'],
  'temp-canvas': ['canvas-ops'],
  'project-canvas': ['canvas-ops', 'project-ops'],
  'project-list': ['project-ops'],
  'project-index': ['project-ops'],
  'project-files': ['project-ops', 'file-ops'],
  'project-history': ['project-ops'],
  'project-tasks': ['project-ops', 'task-ops'],
  'project-settings': ['project-ops', 'settings-guide'],
  'calendar': ['calendar-ops'],
  'email': ['email-ops'],
  'tasks': ['task-ops'],
  'settings': ['settings-guide'],
  'workbench': ['workbench-ops'],
  'ai-chat': [],
  'agent-list': [],
  'skill-list': [],
}

/** The baseline skill always appended to auto-loaded results. */
const BASELINE_SKILL = 'openloaf-basics'

/**
 * Resolve auto-loaded skill names from page context.
 * Returns deduplicated list with `openloaf-basics` always included last.
 */
export function resolveAutoSkillsByPageContext(
  pageContext: ChatPageContext | undefined | null,
): string[] {
  if (!pageContext?.page) return [BASELINE_SKILL]

  const pageSkills = PAGE_SKILL_MAP[pageContext.page]
  if (!pageSkills) return [BASELINE_SKILL]

  // Deduplicate and append baseline
  const result = [...pageSkills]
  if (!result.includes(BASELINE_SKILL)) {
    result.push(BASELINE_SKILL)
  }
  return result
}
