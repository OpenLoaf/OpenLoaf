import type { AgentTemplate } from '../../types'
import CALENDAR_PROMPT from './prompt.zh.md'

export const calendarTemplate: AgentTemplate = {
  id: 'calendar',
  name: '日历助手',
  description: '日历事件管理',
  icon: 'calendar',
  toolIds: ['calendar-query', 'calendar-mutate'],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: CALENDAR_PROMPT.trim(),
}
