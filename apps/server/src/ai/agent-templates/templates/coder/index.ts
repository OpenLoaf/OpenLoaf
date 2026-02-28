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
import CODER_PROMPT from './prompt.zh.md'

export const coderTemplate: AgentTemplate = {
  id: 'coder',
  name: '编码助手',
  description: '使用 AI CLI 工具进行代码开发',
  icon: 'code',
  toolIds: [
    'time-now',
    'update-plan',
    'request-user-input',
    'spawn-agent',
    'send-input',
    'wait-agent',
    'abort-agent',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: false,
  systemPrompt: CODER_PROMPT.trim(),
}
