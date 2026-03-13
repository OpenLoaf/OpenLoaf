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
import MASTER_PROMPT_ZH from './prompt-v3.zh.md'
import MASTER_PROMPT_EN from './prompt-v3.en.md'

export const masterTemplate: AgentTemplate = {
  id: 'master',
  name: '主助手',
  description: '混合模式主助手，可直接执行简单任务，也可调度子 Agent',
  icon: 'sparkles',
  toolIds: [
    'tool-search',
    'load-skill',
  ],
  deferredToolIds: [
    // system
    'time-now',
    'update-plan',
    'jsx-create',
    'request-user-input',
    // agent
    'spawn-agent',
    'send-input',
    'wait-agent',
    'abort-agent',
    // file
    'read-file',
    'list-dir',
    'grep-files',
    'apply-patch',
    // shell
    'shell-command',
    // web
    'open-url',
    // browser automation
    'browser-snapshot',
    'browser-observe',
    'browser-extract',
    'browser-act',
    'browser-wait',
    'browser-screenshot',
    'browser-download-image',
    // media
    'image-generate',
    'video-generate',
    // chart
    'chart-render',
    // code
    'js-repl',
    'js-repl-reset',
    // task
    'task-manage',
    'task-status',
    // project
    'project-query',
    'project-mutate',
    // calendar
    'calendar-query',
    'calendar-mutate',
    // email
    'email-query',
    'email-mutate',
    // excel
    'excel-query',
    'excel-mutate',
    // word
    'word-query',
    'word-mutate',
    // pptx
    'pptx-query',
    'pptx-mutate',
    // pdf
    'pdf-query',
    'pdf-mutate',
    // convert
    'image-process',
    'video-convert',
    'doc-convert',
    // document
    'edit-document',
    // widget
    'generate-widget',
    'widget-init',
    'widget-list',
    'widget-get',
    'widget-check',
    // file info
    'file-info',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: true,
  systemPrompt: MASTER_PROMPT_ZH.trim(),
}

/** Get prompt in specified language. */
export function getMasterPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return MASTER_PROMPT_EN.trim()
  }
  return MASTER_PROMPT_ZH.trim()
}
