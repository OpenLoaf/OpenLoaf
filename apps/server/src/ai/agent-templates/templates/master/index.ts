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
import MASTER_IDENTITY_ZH from './identity.zh.md'
import MASTER_IDENTITY_EN from './identity.en.md'
import STANDARD_PROMPT_ZH from './prompt-v3.zh.md'
import STANDARD_PROMPT_EN from './prompt-v3.en.md'

/** Combine identity + standard prompt. */
function combine(identity: string, prompt: string): string {
  return `${identity.trim()}\n\n---\n\n${prompt.trim()}`
}

export const masterTemplate: AgentTemplate = {
  id: 'master',
  name: 'AI 秘书',
  description: 'AI 秘书，负责全局调度、即时问答、委派复杂任务',
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
    // file (read-only — "看"不"做")
    'read-file',
    'list-dir',
    'grep-files',
    'file-info',
    // shell
    'shell-command',
    // web
    'open-url',
    'web-search',
    // browser automation
    'browser-snapshot',
    'browser-observe',
    'browser-extract',
    'browser-act',
    'browser-wait',
    'browser-screenshot',
    'browser-download-image',
    // media (simple one-step generation)
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
    // board (query only — mutate goes to PM/Specialist)
    'board-query',
    // calendar
    'calendar-query',
    'calendar-mutate',
    // email
    'email-query',
    'email-mutate',
    // office (query only — mutate goes to PM/Specialist)
    'excel-query',
    'word-query',
    'pptx-query',
    'pdf-query',
    // widget (query only)
    'widget-list',
    'widget-get',
    'widget-check',
    // memory
    'memory-search',
    'memory-get',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: true,
  systemPrompt: combine(MASTER_IDENTITY_ZH, STANDARD_PROMPT_ZH),
}

/** Get master prompt (identity + standard framework) in specified language. */
export function getMasterPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return combine(MASTER_IDENTITY_EN, STANDARD_PROMPT_EN)
  }
  return combine(MASTER_IDENTITY_ZH, STANDARD_PROMPT_ZH)
}

/** Get standard thinking framework only (for PM/Project agents to reuse). */
export function getStandardPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return STANDARD_PROMPT_EN.trim()
  }
  return STANDARD_PROMPT_ZH.trim()
}
