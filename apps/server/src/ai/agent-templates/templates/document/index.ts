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
import DOCUMENT_PROMPT from './prompt.zh.md'

export const documentTemplate: AgentTemplate = {
  id: 'document',
  name: '文档助手',
  description: '文件读写、文档分析与自动总结',
  icon: 'file-text',
  toolIds: [
    'read-file',
    'list-dir',
    'grep-files',
    'apply-patch',
    'edit-document',
    'project-query',
    'project-mutate',
    'spawn-agent',
    'wait-agent',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: false,
  systemPrompt: DOCUMENT_PROMPT.trim(),
}
