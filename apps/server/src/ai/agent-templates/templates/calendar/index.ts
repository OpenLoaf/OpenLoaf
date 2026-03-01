/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { AgentTemplate } from '../../types'
import CALENDAR_PROMPT_ZH from './prompt.zh.md'
import CALENDAR_PROMPT_EN from './prompt.en.md'

export const calendarTemplate: AgentTemplate = {
  id: 'calendar',
  name: '日历助手',
  description: '日历事件管理',
  icon: 'calendar',
  toolIds: ['calendar-query', 'calendar-mutate'],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: CALENDAR_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getCalendarPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return CALENDAR_PROMPT_EN.trim()
  }
  return CALENDAR_PROMPT_ZH.trim()
}
