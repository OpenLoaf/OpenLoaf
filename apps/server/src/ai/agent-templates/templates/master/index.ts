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
import MASTER_PROMPT from './prompt.zh.md'

export const masterTemplate: AgentTemplate = {
  id: 'master',
  name: '主助手',
  description: '混合模式主助手，可直接执行简单任务，也可调度子 Agent',
  icon: 'sparkles',
  toolIds: [
    // system
    'time-now',
    'update-plan',
    'jsx-create',
    // agent
    'spawn-agent',
    'send-input',
    'wait-agent',
    'abort-agent',
    // file-read
    'read-file',
    'list-dir',
    'grep-files',
    // file-write (直接修改文件，避免简单编辑也要 spawn)
    'apply-patch',
    // shell (直接执行简单命令，避免不必要的子 Agent 调度)
    'shell-command',
    // web
    'open-url',
    // image-generate
    'image-generate',
    // video-generate
    'video-generate',
    // chart
    'chart-render',
    // code-interpreter
    'js-repl',
    'js-repl-reset',
    // task
    'task-manage',
    'task-status',
    // extra
    'request-user-input',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: true,
  systemPrompt: MASTER_PROMPT.trim(),
}
