import type { AgentTemplate } from '../../types'
import BROWSER_PROMPT from './prompt.zh.md'

export const browserTemplate: AgentTemplate = {
  id: 'browser',
  name: '浏览器助手',
  description: '网页浏览和数据抓取',
  icon: 'globe',
  toolIds: [
    'open-url',
    'browser-snapshot',
    'browser-observe',
    'browser-extract',
    'browser-act',
    'browser-wait',
  ],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: BROWSER_PROMPT.trim(),
}
