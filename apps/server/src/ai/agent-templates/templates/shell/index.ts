import type { AgentTemplate } from '../../types'
import SHELL_PROMPT from './prompt.zh.md'

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
  ],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: SHELL_PROMPT.trim(),
}
