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
import PROJECT_PROMPT from './prompt.zh.md'

export const projectTemplate: AgentTemplate = {
  id: 'project',
  name: '项目助手',
  description: '项目数据查询操作',
  icon: 'folder-kanban',
  toolIds: ['project-query', 'project-mutate'],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: PROJECT_PROMPT.trim(),
}
