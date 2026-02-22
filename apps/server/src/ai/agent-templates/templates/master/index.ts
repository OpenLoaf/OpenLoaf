import type { AgentTemplate } from '../../types'
import MASTER_PROMPT from './prompt.zh.md'

export const masterTemplate: AgentTemplate = {
  id: 'master',
  name: '主助手',
  description: '混合模式主助手，可直接执行简单任务，也可调度子 Agent',
  icon: 'sparkles',
  toolIds: [
    // system
    'time-now',
    'json-render',
    'update-plan',
    // agent
    'spawn-agent',
    'send-input',
    'wait-agent',
    'abort-agent',
    // file-read
    'read-file',
    'list-dir',
    'grep-files',
    // web
    'open-url',
    // image-generate
    'image-generate',
    // video-generate
    'video-generate',
    // code-interpreter
    'js-repl',
    'js-repl-reset',
    // extra
    'request-user-input',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: true,
  systemPrompt: MASTER_PROMPT.trim(),
}
