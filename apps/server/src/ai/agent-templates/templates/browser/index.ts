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
import BROWSER_PROMPT_ZH from './prompt.zh.md'
import BROWSER_PROMPT_EN from './prompt.en.md'

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
  systemPrompt: BROWSER_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getBrowserPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return BROWSER_PROMPT_EN.trim()
  }
  return BROWSER_PROMPT_ZH.trim()
}
