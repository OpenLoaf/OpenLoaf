/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import PROJECT_PROMPT_ZH from './prompt.zh.md'
import PROJECT_PROMPT_EN from './prompt.en.md'

/** Project Agent 专用工具集（面向项目任务执行，不含任务管理/日历/邮件）。 */
export const PROJECT_AGENT_TOOL_IDS = [
  // system
  'tool-search',
  'load-skill',
  'time-now',
  'update-plan',
  'jsx-create',
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
  'web-search',
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
  // project (query only — project agent works within a project, not managing projects)
  'project-query',
  // document
  'edit-document',
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
  // widget
  'generate-widget',
  'widget-init',
  'widget-list',
  'widget-get',
  'widget-check',
  // file info
  'file-info',
  // memory
  'memory-search',
  'memory-get',
] as const

/** Get project agent prompt in specified language. */
export function getProjectPrompt(lang?: string): string {
  if (lang?.startsWith('en')) {
    return PROJECT_PROMPT_EN.trim()
  }
  return PROJECT_PROMPT_ZH.trim()
}
