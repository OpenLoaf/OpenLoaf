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
import STANDARD_PROMPT_ZH from './prompt-v4.zh.md'
import STANDARD_PROMPT_EN from './prompt-v4.en.md'

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
  ],
  deferredToolIds: [
    // system
    'UpdatePlan',
    'JsxCreate',
    'FileInfo',
    // web
    'OpenUrl',
    'WebSearch',
    'WebFetch',
    // browser automation
    'BrowserSnapshot',
    'BrowserObserve',
    'BrowserExtract',
    'BrowserAct',
    'BrowserWait',
    'BrowserScreenshot',
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
    // task
    'TaskManage',
    'TaskStatus',
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
