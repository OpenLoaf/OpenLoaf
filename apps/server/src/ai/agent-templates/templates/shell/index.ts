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
import SHELL_PROMPT_ZH from './prompt.zh.md'
import SHELL_PROMPT_EN from './prompt.en.md'

export const shellTemplate: AgentTemplate = {
  id: 'shell',
  name: '终端助手',
  description: 'Shell 命令执行',
  icon: 'terminal',
  toolIds: [
    'shell',
    'shell-command',
    'exec-command',
    'write-stdin',
    'spawn-agent',
    'wait-agent',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: false,
  systemPrompt: SHELL_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getShellPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return SHELL_PROMPT_EN.trim()
  }
  return SHELL_PROMPT_ZH.trim()
}
