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
import MASTER_PROMPT_ZH from './prompt-v5.zh.md'
import MASTER_PROMPT_EN from './prompt-v5.en.md'
import HARNESS_ZH from './harness-v5.zh.md'
import HARNESS_EN from './harness-v5.en.md'

/** Combine master-specific prompt with shared harness core. */
function combine(masterPrompt: string, harness: string): string {
  return `${masterPrompt.trim()}\n\n---\n\n${harness.trim()}`
}

export const masterTemplate: AgentTemplate = {
  id: 'master',
  name: 'AI 秘书',
  description: 'AI 秘书，负责全局调度、即时问答、委派复杂任务',
  icon: 'sparkles',
  toolIds: [
    // Core tools — always loaded (like Claude Code)
    'ToolSearch',
    'Bash',
    'Read',
    'Glob',
    'Grep',
    'Edit',
    'Write',
    'AskUserQuestion',
    // agent collaboration
    'Agent',
    'SendMessage',
    // background process (always available — Bash returns task_id, AI needs
    // immediate access to manage it without ToolSearch round-trip)
    'BgList',
    'BgOutput',
    'BgKill',
    'Sleep',
  ],
  deferredToolIds: [
    // system
    'JsxCreate',
    'FileInfo',
    // web
    'OpenUrl',
    'WebSearch',
    'WebFetch',
    // browser automation
    'BrowserSnapshot',
    'BrowserAct',
    'BrowserWait',
    'BrowserDownloadImage',
    // media download (AI media generation moved to board v3 flow)
    'VideoDownload',
    // chart
    'ChartRender',
    // project
    'ProjectQuery',
    'ProjectMutate',
    // board
    'BoardQuery',
    'BoardMutate',
    // calendar
    'CalendarQuery',
    'CalendarMutate',
    // email
    'EmailQuery',
    'EmailMutate',
    // document
    'EditDocument',
    // office
    'ExcelQuery',
    'ExcelMutate',
    'WordQuery',
    'WordMutate',
    'PptxQuery',
    'PptxMutate',
    'PdfQuery',
    'PdfMutate',
    // convert
    'ImageProcess',
    'VideoConvert',
    'DocConvert',
    // widget
    'GenerateWidget',
    'WidgetInit',
    'WidgetList',
    'WidgetGet',
    'WidgetCheck',
    // memory
    'MemorySave',
    'MemorySearch',
    'MemoryGet',
    // scheduled task
    'ScheduledTaskManage',
    'ScheduledTaskStatus',
    'ScheduledTaskWait',
  ],
  allowSubAgents: true,
  maxDepth: 2,
  isPrimary: true,
  systemPrompt: combine(MASTER_PROMPT_ZH, HARNESS_ZH),
}

/** Get master prompt (master identity + skill routing + harness core) in specified language. */
export function getMasterPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return combine(MASTER_PROMPT_EN, HARNESS_EN)
  }
  return combine(MASTER_PROMPT_ZH, HARNESS_ZH)
}

/** Get the shared harness core (for PM/Project agents to reuse, without the Master identity). */
export function getStandardPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return HARNESS_EN.trim()
  }
  return HARNESS_ZH.trim()
}
