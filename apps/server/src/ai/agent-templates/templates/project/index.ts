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
import PROJECT_PROMPT_ZH from './prompt.zh.md'
import PROJECT_PROMPT_EN from './prompt.en.md'

export const projectTemplate: AgentTemplate = {
  id: 'project',
  name: '项目助手',
  description: '项目数据查询操作',
  icon: 'folder-kanban',
  toolIds: ['project-query', 'project-mutate', 'spawn-agent', 'wait-agent'],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: false,
  systemPrompt: PROJECT_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getProjectPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return PROJECT_PROMPT_EN.trim()
  }
  return PROJECT_PROMPT_ZH.trim()
}
