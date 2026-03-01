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
import EMAIL_PROMPT_ZH from './prompt.zh.md'
import EMAIL_PROMPT_EN from './prompt.en.md'

export const emailTemplate: AgentTemplate = {
  id: 'email',
  name: '邮件助手',
  description: '邮件查询和操作',
  icon: 'mail',
  toolIds: ['email-query', 'email-mutate'],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: EMAIL_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getEmailPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return EMAIL_PROMPT_EN.trim()
  }
  return EMAIL_PROMPT_ZH.trim()
}
